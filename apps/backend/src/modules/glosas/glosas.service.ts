import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId, getAuditActorLabel, requestActorStore } from "../../common/audit-actor";
import { GlosaOrigin, MeasurementStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import { CreateGlosaDto } from "./glosas.dto";

@Injectable()
export class GlosasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  /**
   * Cria glosa avulsa (compatibilidade). A UI principal registra glosas na medição.
   * Origem automática não é aceita por este endpoint.
   */
  async create(dto: CreateGlosaDto): Promise<unknown> {
    const measurement = await this.prisma.measurement.findFirst({
      where: { id: dto.measurementId, deletedAt: null },
      include: { items: true }
    });
    if (!measurement) throw new NotFoundException("Medição não encontrada");
    if (measurement.status === MeasurementStatus.APPROVED) {
      throw new BadRequestException("Medição aprovada está congelada; não é possível adicionar glosas.");
    }
    if (measurement.status === MeasurementStatus.OPEN) {
      throw new BadRequestException("Calcule a medição antes de registrar glosa");
    }
    const justification = dto.justification?.trim();
    if (!justification) {
      throw new BadRequestException("Glosa manual exige justificativa.");
    }
    if (dto.origin === GlosaOrigin.AUTOMATIC) {
      throw new BadRequestException("Glosas automáticas são geradas apenas pelo cálculo da medição.");
    }
    if (dto.measurementItemId) {
      const item = measurement.items.find((i) => i.id === dto.measurementItemId);
      if (!item) throw new BadRequestException("Linha da medição inválida para a glosa.");
    }

    const createdBy = dto.createdBy?.trim() || getAuditActorLabel();
    const glosa = await this.prisma.glosa.create({
      data: {
        measurementId: dto.measurementId,
        measurementItemId: dto.measurementItemId,
        type: dto.type,
        origin: GlosaOrigin.MANUAL,
        value: new Prisma.Decimal(dto.value),
        justification,
        createdBy
      }
    });
    await this.audit("Glosa", glosa.id, "CREATE", createdBy, null, glosa);
    if (dto.measurementItemId) {
      await this.prisma.measurementItem.update({
        where: { id: dto.measurementItemId },
        data: { glosedValue: { increment: dto.value } }
      });
    }
    const totalGlosas = await this.prisma.glosa.aggregate({
      where: { measurementId: dto.measurementId },
      _sum: { value: true }
    });
    const glosed = totalGlosas._sum.value ?? new Prisma.Decimal(0);
    const approvedRaw = measurement.totalMeasuredValue.sub(glosed);
    const approved = approvedRaw.lt(0) ? new Prisma.Decimal(0) : approvedRaw;
    const updatedMeasurement = await this.prisma.measurement.update({
      where: { id: dto.measurementId },
      data: {
        totalGlosedValue: glosed,
        totalApprovedValue: approved,
        status: glosed.gt(0) ? MeasurementStatus.GLOSSED : MeasurementStatus.UNDER_REVIEW
      }
    });
    await this.audit("Measurement", dto.measurementId, "UPDATE_BY_GLOSA", createdBy, measurement, updatedMeasurement);
    return glosa;
  }

  async findAll(): Promise<unknown> {
    return this.prisma.glosa.findMany({
      where: this.organizationScope(),
      select: {
        id: true,
        measurementId: true,
        measurementItemId: true,
        type: true,
        origin: true,
        value: true,
        createdBy: true,
        createdAt: true,
        measurement: {
          select: {
            id: true,
            referenceMonth: true,
            referenceYear: true,
            contract: {
              select: {
                id: true,
                number: true,
                name: true,
                internalCode: true,
                formalNumber: true
              }
            }
          }
        },
        measurementItem: {
          select: { id: true, descriptionSnapshot: true, isLegacyMonthly: true }
        },
        _count: { select: { attachments: true } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async findOne(id: string): Promise<unknown> {
    const glosa = await this.prisma.glosa.findFirst({
      where: { id, ...this.organizationScope() },
      include: {
        measurement: { include: { contract: true } },
        measurementItem: true,
        attachments: true
      }
    });
    if (!glosa) throw new NotFoundException("Glosa não encontrada");
    return glosa;
  }

  async addAttachmentUpload(glosaId: string, file: Express.Multer.File): Promise<unknown> {
    const exists = await this.prisma.glosa.findUnique({ where: { id: glosaId } });
    if (!exists) throw new NotFoundException("Glosa não encontrada");
    if (!file.buffer?.length) {
      throw new BadRequestException("Arquivo vazio");
    }
    const { filePath } = await this.storage.saveGlosaFile(glosaId, file.buffer, file.originalname, file.mimetype);
    const attachment = await this.prisma.attachment.create({
      data: {
        glosaId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        filePath
      }
    });
    await this.audit("Attachment", attachment.id, "CREATE", getAuditActorId(), null, attachment);
    return attachment;
  }

  async removeAttachment(glosaId: string, attachmentId: string): Promise<{ ok: true }> {
    const att = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, glosaId }
    });
    if (!att) throw new NotFoundException("Anexo não encontrado nesta glosa");
    await this.storage.unlinkStoredByRelativeSafe(att.filePath);
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    await this.audit("Attachment", attachmentId, "DELETE", getAuditActorId(), att, null);
    return { ok: true };
  }

  private async audit(
    entity: string,
    entityId: string,
    action: string,
    userId: string,
    oldData: unknown,
    newData: unknown
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        entity,
        entityId,
        action,
        userId,
        oldData: oldData ? (oldData as Prisma.InputJsonValue) : undefined,
        newData: newData ? (newData as Prisma.InputJsonValue) : undefined
      }
    });
  }

  /** Escopo pelo órgão do contexto ativo (sem bypass automático por ADMIN). */
  private organizationScope(): Prisma.GlosaWhereInput {
    const actor = requestActorStore.getStore();
    if (actor?.allOrganizationsActive || !actor?.organizationId) {
      return {};
    }
    return {
      measurement: {
        is: {
          contract: { is: { organizationId: actor.organizationId } }
        }
      }
    };
  }
}
