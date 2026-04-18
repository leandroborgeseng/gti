import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId } from "../../common/audit-actor";
import { MeasurementItemType, MeasurementStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import { CreateMeasurementDto } from "./measurements.dto";

@Injectable()
export class MeasurementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

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
      include: {
        contract: { include: { services: true } },
        items: true,
        glosas: true,
        attachments: true
      }
    });
    if (!m) throw new NotFoundException("Medição não encontrada");
    return m;
  }

  /** Linhas de consumo (serviços) para contratos tipo datacenter ou infra; só com medição «Aberta». */
  async addItems(measurementId: string, items: { type: MeasurementItemType; referenceId: string; quantity: number }[]): Promise<unknown> {
    const m = await this.prisma.measurement.findFirst({
      where: { id: measurementId, deletedAt: null },
      include: {
        items: true,
        contract: { include: { services: true } }
      }
    });
    if (!m) throw new NotFoundException("Medição não encontrada");
    if (m.status !== MeasurementStatus.OPEN) {
      throw new BadRequestException("Só é possível adicionar linhas com a medição em estado «Aberta».");
    }
    const ct = m.contract.contractType;
    if (ct !== "DATACENTER" && ct !== "INFRA") {
      throw new BadRequestException("Linhas por serviço só se aplicam a contratos datacenter ou infraestrutura.");
    }
    const serviceIds = new Set(m.contract.services.map((s) => s.id));
    const existingRefs = new Set(m.items.map((i) => i.referenceId));
    for (const row of items) {
      if (row.type !== MeasurementItemType.SERVICE) {
        throw new BadRequestException("Cada linha deve ser do tipo SERVIÇO.");
      }
      if (!serviceIds.has(row.referenceId)) {
        throw new BadRequestException(`Serviço inválido ou fora do contrato: ${row.referenceId}`);
      }
      if (existingRefs.has(row.referenceId)) {
        throw new BadRequestException(`Já existe linha para o serviço indicado (${row.referenceId}).`);
      }
      existingRefs.add(row.referenceId);
    }
    await this.prisma.measurementItem.createMany({
      data: items.map((row) => ({
        measurementId,
        type: MeasurementItemType.SERVICE,
        referenceId: row.referenceId,
        quantity: new Prisma.Decimal(row.quantity),
        calculatedValue: new Prisma.Decimal(0)
      }))
    });
    return this.findOne(measurementId);
  }

  /** Remove uma linha da medição; só com estado «Aberta». */
  async removeItem(measurementId: string, itemId: string): Promise<unknown> {
    const m = await this.prisma.measurement.findFirst({
      where: { id: measurementId, deletedAt: null },
      include: { items: true }
    });
    if (!m) throw new NotFoundException("Medição não encontrada");
    if (m.status !== MeasurementStatus.OPEN) {
      throw new BadRequestException("Só é possível remover linhas com a medição em estado «Aberta».");
    }
    const item = m.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException("Linha não encontrada nesta medição");
    }
    try {
      await this.prisma.measurementItem.delete({ where: { id: itemId } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        throw new BadRequestException("Não é possível remover a linha: existem referências associadas.");
      }
      throw e;
    }
    return this.findOne(measurementId);
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
    if (measurement.status === MeasurementStatus.APPROVED) {
      throw new BadRequestException("Medição aprovada não pode ser recalculada");
    }

    const contractType = measurement.contract.contractType;
    /**
     * SOFTWARE e SERVICO: valor mensal × proporção de funcionalidades em estado VALIDATED (entregas).
     * DATACENTER e INFRA: soma de (quantidade × valor unitário) por linha de serviço contratada (`MeasurementItem` tipo SERVICE).
     */
    let measured = new Prisma.Decimal(0);
    if (contractType === "SOFTWARE" || contractType === "SERVICO") {
      const features = measurement.contract.modules.flatMap((m) => m.features);
      const total = features.length;
      const validated = features.filter((f) => f.status === "VALIDATED").length;
      const percentual = total > 0 ? new Prisma.Decimal(validated).div(total) : new Prisma.Decimal(0);
      measured = measurement.contract.monthlyValue.mul(percentual);
    } else if (contractType === "DATACENTER" || contractType === "INFRA") {
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
    const approvedRaw = measured.sub(glosas);
    const approved = approvedRaw.lt(0) ? new Prisma.Decimal(0) : approvedRaw;
    const nextStatus = glosas.gt(0) ? MeasurementStatus.GLOSSED : MeasurementStatus.UNDER_REVIEW;
    const updated = await this.prisma.measurement.update({
      where: { id },
      data: {
        status: nextStatus,
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
    if (measurement.status === MeasurementStatus.OPEN) {
      throw new BadRequestException("Calcule a medição antes de aprovar");
    }
    if (measurement.status === MeasurementStatus.APPROVED) {
      throw new BadRequestException("Medição já está aprovada");
    }
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

  async addAttachmentUpload(measurementId: string, file: Express.Multer.File): Promise<unknown> {
    const exists = await this.prisma.measurement.findFirst({ where: { id: measurementId, deletedAt: null } });
    if (!exists) throw new NotFoundException("Medição não encontrada");
    if (!file.buffer?.length) {
      throw new BadRequestException("Ficheiro vazio");
    }
    const { filePath } = await this.storage.saveMeasurementFile(
      measurementId,
      file.buffer,
      file.originalname,
      file.mimetype
    );
    const attachment = await this.prisma.attachment.create({
      data: {
        measurementId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        filePath
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
        userId: getAuditActorId(),
        oldData: oldData ? (oldData as Prisma.InputJsonValue) : undefined,
        newData: newData ? (newData as Prisma.InputJsonValue) : undefined
      }
    });
  }
}
