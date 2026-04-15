import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MeasurementStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateGlosaDto } from "./glosas.dto";

@Injectable()
export class GlosasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateGlosaDto): Promise<unknown> {
    const measurement = await this.prisma.measurement.findFirst({ where: { id: dto.measurementId, deletedAt: null } });
    if (!measurement) throw new NotFoundException("Medição não encontrada");
    if (measurement.status === MeasurementStatus.OPEN) throw new BadRequestException("Calcule a medição antes de registrar glosa");
    const createdBy = dto.createdBy?.trim() || "system";
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
      include: { measurement: { include: { contract: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async addAttachment(glosaId: string, payload: { fileName: string; mimeType: string; filePath: string }): Promise<unknown> {
    const exists = await this.prisma.glosa.findUnique({ where: { id: glosaId } });
    if (!exists) throw new NotFoundException("Glosa não encontrada");
    const attachment = await this.prisma.attachment.create({
      data: {
        glosaId,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        filePath: payload.filePath
      }
    });
    await this.audit("Attachment", attachment.id, "CREATE", "system", null, attachment);
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
