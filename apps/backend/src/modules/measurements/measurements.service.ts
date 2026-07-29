import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId } from "../../common/audit-actor";
import { ContractPricingBillingKind, ContractPricingItemStatus, MeasurementItemType, MeasurementStatus, Prisma } from "@prisma/client";
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

    const measurement = await this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.findFirst({ where: { id: dto.contractId, deletedAt: null }, select: { id: true } });
      if (!contract) throw new NotFoundException("Contrato não encontrado");

      const pricingItems = await this.resolvePricingItems(tx, dto.contractId, dto.items ?? []);
      return tx.measurement.create({
        data: {
          contractId: dto.contractId,
          referenceMonth: dto.referenceMonth,
          referenceYear: dto.referenceYear,
          items: dto.items?.length
            ? {
                create: dto.items.map((item) => ({
                  type: item.type,
                  referenceId: item.referenceId,
                  pricingItemId: item.pricingItemId,
                  quantity: new Prisma.Decimal(item.quantity),
                  calculatedValue: item.pricingItemId
                    ? new Prisma.Decimal(item.quantity).mul(pricingItems.get(item.pricingItemId)!.unitValue)
                    : new Prisma.Decimal(0)
                }))
              }
            : undefined
        },
        include: { items: true }
      });
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
        contract: {
          include: {
            services: true,
            pricingItems: {
              where: { status: ContractPricingItemStatus.ACTIVE },
              include: { type: true, unit: true },
              orderBy: { sequence: "asc" }
            }
          }
        },
        items: true,
        glosas: true,
        attachments: true
      }
    });
    if (!m) throw new NotFoundException("Medição não encontrada");
    return m;
  }

  /** Linhas de consumo (serviços) para contratos tipo datacenter ou infra; só com medição «Aberta». */
  async addItems(
    measurementId: string,
    items: { type: MeasurementItemType; referenceId: string; quantity: number; pricingItemId?: string }[]
  ): Promise<unknown> {
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
    await this.prisma.$transaction(async (tx) => {
      const pricingItems = await this.resolvePricingItems(tx, m.contractId, items);
      await tx.measurementItem.createMany({
        data: items.map((row) => ({
          measurementId,
          type: MeasurementItemType.SERVICE,
          referenceId: row.referenceId,
          pricingItemId: row.pricingItemId,
          quantity: new Prisma.Decimal(row.quantity),
          calculatedValue: row.pricingItemId
            ? new Prisma.Decimal(row.quantity).mul(pricingItems.get(row.pricingItemId)!.unitValue)
            : new Prisma.Decimal(0)
        }))
      });
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

  /** Atualiza a quantidade de uma linha; só com medição «Aberta» (voltar a calcular depois). */
  async patchItem(measurementId: string, itemId: string, quantity: number): Promise<unknown> {
    const m = await this.prisma.measurement.findFirst({
      where: { id: measurementId, deletedAt: null },
      include: { items: true }
    });
    if (!m) throw new NotFoundException("Medição não encontrada");
    if (m.status !== MeasurementStatus.OPEN) {
      throw new BadRequestException("Só é possível alterar linhas com a medição em estado «Aberta».");
    }
    const item = m.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException("Linha não encontrada nesta medição");
    }
    await this.prisma.$transaction(async (tx) => {
      let calculatedValue = new Prisma.Decimal(0);
      if (item.pricingItemId) {
        const pricingItems = await this.resolvePricingItems(tx, m.contractId, [
          { quantity, pricingItemId: item.pricingItemId }
        ]);
        calculatedValue = new Prisma.Decimal(quantity).mul(pricingItems.get(item.pricingItemId)!.unitValue);
      }
      await tx.measurementItem.update({
        where: { id: itemId },
        data: { quantity: new Prisma.Decimal(quantity), calculatedValue }
      });
    });
    return this.findOne(measurementId);
  }

  async calculate(id: string): Promise<unknown> {
    const measurement = await this.prisma.measurement.findFirst({
      where: { id, deletedAt: null },
      include: {
        contract: {
          include: {
            modules: { include: { features: true } },
            services: true,
            pricingItems: { where: { status: ContractPricingItemStatus.ACTIVE }, include: { type: true } }
          }
        },
        items: { include: { pricingItem: true } },
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
      const glosaBase = measurement.contract.pricingItems.find(
        (item) => item.type.participatesInGlosa || item.type.code === "MENSALIDADE"
      );
      measured = (glosaBase?.totalValue ?? measurement.contract.monthlyValue).mul(percentual);
    } else if (contractType === "DATACENTER" || contractType === "INFRA") {
      const serviceMap = new Map(measurement.contract.services.map((s) => [s.id, s]));
      for (const item of measurement.items) {
        if (item.type !== MeasurementItemType.SERVICE) continue;
        const service = serviceMap.get(item.referenceId);
        const unitValue = item.pricingItem?.unitValue ?? service?.unitValue;
        if (!unitValue) continue;
        const calc = item.quantity.mul(unitValue);
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
    const measurement = await this.prisma.measurement.findFirst({
      where: { id, deletedAt: null },
      include: { items: { where: { pricingItemId: { not: null } } } }
    });
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
    const updated = await this.prisma.$transaction(async (tx) => {
      const consumptionByPricingItem = new Map<string, Prisma.Decimal>();
      for (const item of measurement.items) {
        if (!item.pricingItemId) continue;
        const previous = consumptionByPricingItem.get(item.pricingItemId) ?? new Prisma.Decimal(0);
        consumptionByPricingItem.set(item.pricingItemId, previous.add(item.quantity));
      }
      for (const [pricingItemId, quantity] of consumptionByPricingItem) {
        const pricingItem = await tx.contractPricingItem.findFirst({
          where: { id: pricingItemId, contractId: measurement.contractId },
          select: { billingKind: true, quantity: true, consumedQuantity: true }
        });
        if (!pricingItem) throw new BadRequestException("Um item de precificação da medição não pertence ao contrato.");
        if (pricingItem.billingKind !== ContractPricingBillingKind.ON_DEMAND) continue;

        const available = pricingItem.quantity.sub(pricingItem.consumedQuantity);
        if (quantity.gt(available)) {
          throw new BadRequestException("A aprovação excede o saldo disponível do item contratual sob demanda.");
        }
        const consumed = await tx.contractPricingItem.updateMany({
          where: {
            id: pricingItemId,
            contractId: measurement.contractId,
            status: ContractPricingItemStatus.ACTIVE,
            consumedQuantity: { lte: pricingItem.quantity.sub(quantity) }
          },
          data: { consumedQuantity: { increment: quantity } }
        });
        if (consumed.count !== 1) {
          throw new BadRequestException("O saldo do item contratual foi alterado; revise a medição antes de aprovar.");
        }
      }
      return tx.measurement.update({ where: { id }, data: { status: MeasurementStatus.APPROVED } });
    });
    await this.audit("Measurement", id, "APPROVE", measurement, updated);
    return updated;
  }

  async addAttachmentUpload(measurementId: string, file: Express.Multer.File): Promise<unknown> {
    const exists = await this.prisma.measurement.findFirst({ where: { id: measurementId, deletedAt: null } });
    if (!exists) throw new NotFoundException("Medição não encontrada");
    if (!file.buffer?.length) {
      throw new BadRequestException("Arquivo vazio");
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

  async removeAttachment(measurementId: string, attachmentId: string): Promise<{ ok: true }> {
    const att = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, measurementId }
    });
    if (!att) throw new NotFoundException("Anexo não encontrado nesta medição");
    await this.storage.unlinkStoredByRelativeSafe(att.filePath);
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    await this.audit("Attachment", attachmentId, "DELETE", att, null);
    return { ok: true };
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

  /**
   * Confere que os itens informados estão ativos e pertencem ao contrato.
   * Para itens sob demanda, a quantidade lançada não pode ultrapassar o saldo já contratado.
   */
  private async resolvePricingItems(
    tx: Prisma.TransactionClient,
    contractId: string,
    rows: Array<{ pricingItemId?: string; quantity: number }>
  ): Promise<Map<string, { billingKind: ContractPricingBillingKind; quantity: Prisma.Decimal; consumedQuantity: Prisma.Decimal; unitValue: Prisma.Decimal }>> {
    const pricingItemIds = [...new Set(rows.map((row) => row.pricingItemId).filter((id): id is string => Boolean(id)))];
    if (!pricingItemIds.length) return new Map();

    const pricingItems = await tx.contractPricingItem.findMany({
      where: { id: { in: pricingItemIds }, contractId },
      select: { id: true, status: true, billingKind: true, quantity: true, consumedQuantity: true, unitValue: true }
    });
    if (pricingItems.length !== pricingItemIds.length) {
      throw new BadRequestException("Item de precificação inválido ou não pertence ao contrato da medição.");
    }

    const byId = new Map(pricingItems.map((item) => [item.id, item]));
    const requestedById = new Map<string, Prisma.Decimal>();
    for (const row of rows) {
      if (!row.pricingItemId) continue;
      const pricingItem = byId.get(row.pricingItemId)!;
      if (pricingItem.status !== ContractPricingItemStatus.ACTIVE) {
        throw new BadRequestException("Só é possível medir itens de precificação ativos.");
      }
      const requested = requestedById.get(row.pricingItemId) ?? new Prisma.Decimal(0);
      requestedById.set(row.pricingItemId, requested.add(new Prisma.Decimal(row.quantity)));
    }
    for (const [pricingItemId, requested] of requestedById) {
      const pricingItem = byId.get(pricingItemId)!;
      if (
        pricingItem.billingKind === ContractPricingBillingKind.ON_DEMAND &&
        requested.gt(pricingItem.quantity.sub(pricingItem.consumedQuantity))
      ) {
        throw new BadRequestException("A quantidade medida excede o saldo disponível do item contratual sob demanda.");
      }
    }
    return byId;
  }
}
