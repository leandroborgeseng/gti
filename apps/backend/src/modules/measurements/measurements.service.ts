import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MeasurementItemType, MeasurementStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateMeasurementDto } from "./measurements.dto";

@Injectable()
export class MeasurementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMeasurementDto): Promise<unknown> {
    const duplicate = await this.prisma.measurement.findFirst({
      where: {
        contractId: dto.contractId,
        referenceMonth: dto.referenceMonth,
        referenceYear: dto.referenceYear,
        deletedAt: null
      }
    });
    if (duplicate) throw new BadRequestException("Já existe medição para este mês/ano");

    const measurement = await this.prisma.measurement.create({
      data: {
        contractId: dto.contractId,
        referenceMonth: dto.referenceMonth,
        referenceYear: dto.referenceYear,
        items: dto.items?.length
          ? {
              create: dto.items.map((item) => ({
                type: item.type,
                referenceId: item.referenceId,
                quantity: new Prisma.Decimal(item.quantity),
                calculatedValue: new Prisma.Decimal(0)
              }))
            }
          : undefined
      },
      include: { items: true }
    });
    await this.audit("Measurement", measurement.id, "CREATE", null, measurement);
    return measurement;
  }

  async findAll(): Promise<unknown> {
    return this.prisma.measurement.findMany({
      where: { deletedAt: null },
      include: { contract: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async findOne(id: string): Promise<unknown> {
    const m = await this.prisma.measurement.findFirst({
      where: { id, deletedAt: null },
      include: { contract: true, items: true, glosas: true }
    });
    if (!m) throw new NotFoundException("Medição não encontrada");
    return m;
  }

  async calculate(id: string): Promise<unknown> {
    const measurement = await this.prisma.measurement.findFirst({
      where: { id, deletedAt: null },
      include: {
        contract: { include: { modules: { include: { features: true } }, services: true } },
        items: true,
        glosas: true
      }
    });
    if (!measurement) throw new NotFoundException("Medição não encontrada");

    let measured = new Prisma.Decimal(0);
    if (measurement.contract.contractType === "SOFTWARE") {
      const features = measurement.contract.modules.flatMap((m) => m.features);
      const total = features.length;
      const validated = features.filter((f) => f.status === "VALIDATED").length;
      const percentual = total > 0 ? new Prisma.Decimal(validated).div(total) : new Prisma.Decimal(0);
      measured = measurement.contract.monthlyValue.mul(percentual);
    } else if (measurement.contract.contractType === "DATACENTER") {
      const serviceMap = new Map(measurement.contract.services.map((s) => [s.id, s]));
      for (const item of measurement.items) {
        if (item.type !== MeasurementItemType.SERVICE) continue;
        const service = serviceMap.get(item.referenceId);
        if (!service) continue;
        const calc = item.quantity.mul(service.unitValue);
        measured = measured.add(calc);
        await this.prisma.measurementItem.update({
          where: { id: item.id },
          data: { calculatedValue: calc }
        });
      }
    } else {
      measured = measurement.items.reduce((acc, item) => acc.add(item.calculatedValue), new Prisma.Decimal(0));
    }

    const glosas = measurement.glosas.reduce((acc, g) => acc.add(g.value), new Prisma.Decimal(0));
    const approved = measured.sub(glosas);
    const updated = await this.prisma.measurement.update({
      where: { id },
      data: {
        status: MeasurementStatus.UNDER_REVIEW,
        totalMeasuredValue: measured,
        totalGlosedValue: glosas,
        totalApprovedValue: approved
      }
    });
    await this.audit("Measurement", id, "CALCULATE", measurement, updated);
    return updated;
  }

  async approve(id: string): Promise<unknown> {
    const measurement = await this.prisma.measurement.findFirst({ where: { id, deletedAt: null } });
    if (!measurement) throw new NotFoundException("Medição não encontrada");
    if (measurement.totalMeasuredValue.lte(0)) {
      throw new BadRequestException("Não é possível aprovar medição sem cálculo");
    }
    const updated = await this.prisma.measurement.update({
      where: { id },
      data: { status: MeasurementStatus.APPROVED }
    });
    await this.audit("Measurement", id, "APPROVE", measurement, updated);
    return updated;
  }

  async addAttachment(measurementId: string, payload: { fileName: string; mimeType: string; filePath: string }): Promise<unknown> {
    const exists = await this.prisma.measurement.findFirst({ where: { id: measurementId, deletedAt: null } });
    if (!exists) throw new NotFoundException("Medição não encontrada");
    const attachment = await this.prisma.attachment.create({
      data: {
        measurementId,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        filePath: payload.filePath
      }
    });
    await this.audit("Attachment", attachment.id, "CREATE", null, attachment);
    return attachment;
  }

  private async audit(entity: string, entityId: string, action: string, oldData: unknown, newData: unknown): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        entity,
        entityId,
        action,
        userId: "system",
        oldData: oldData ? (oldData as Prisma.InputJsonValue) : undefined,
        newData: newData ? (newData as Prisma.InputJsonValue) : undefined
      }
    });
  }
}
