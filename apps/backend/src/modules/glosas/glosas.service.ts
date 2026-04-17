import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId, getAuditActorLabel } from "../../common/audit-actor";
import { MeasurementStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import { CreateGlosaDto } from "./glosas.dto";

@Injectable()
export class GlosasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async create(dto: CreateGlosaDto): Promise<unknown> {
    const measurement = await this.prisma.measurement.findFirst({ where: { id: dto.measurementId, deletedAt: null } });
    if (!measurement) throw new NotFoundException("Medição não encontrada");
    if (measurement.status === MeasurementStatus.OPEN) throw new BadRequestException("Calcule a medição antes de registrar glosa");
    const createdBy = dto.createdBy?.trim() || getAuditActorLabel();
    const glosa = await this.prisma.glosa.create({
      data: {
        measurementId: dto.measurementId,
        type: dto.type,
        value: new Prisma.Decimal(dto.value),
        justification: dto.justification,
        createdBy
      }
    });
    await this.audit("Glosa", glosa.id, "CREATE", createdBy, null, glosa);
    if (measurement.totalMeasuredValue.gt(0)) {
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
    }
    return glosa;
  }

  async findAll(): Promise<unknown> {
    return this.prisma.glosa.findMany({
      include: { measurement: { include: { contract: true } }, attachments: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async findOne(id: string): Promise<unknown> {
    const glosa = await this.prisma.glosa.findFirst({
      where: { id },
      include: { measurement: { include: { contract: true } }, attachments: true }
    });
    if (!glosa) throw new NotFoundException("Glosa não encontrada");
    return glosa;
  }

  async addAttachmentUpload(glosaId: string, file: Express.Multer.File): Promise<unknown> {
    const exists = await this.prisma.glosa.findUnique({ where: { id: glosaId } });
    if (!exists) throw new NotFoundException("Glosa não encontrada");
    if (!file.buffer?.length) {
      throw new BadRequestException("Ficheiro vazio");
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
}
