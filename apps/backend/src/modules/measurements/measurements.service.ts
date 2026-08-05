import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId, getAuditActorLabel, requestActorStore } from "../../common/audit-actor";
import {
  ContractPricingBillingKind,
  ContractPricingItemStatus,
  ContractPricingPeriodicity,
  GlosaOrigin,
  GlosaType,
  MeasurementItemType,
  MeasurementStatus,
  Prisma
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import { CreateMeasurementDto } from "./measurements.dto";
import {
  calculateLineValue,
  competenceWindow,
  composeMeasurementLines,
  monthlyEquivalentValue
} from "./measurement-composition";

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
      const contract = await tx.contract.findFirst({
        where: { id: dto.contractId, deletedAt: null },
        select: {
          id: true,
          startDate: true,
          formalNumber: true,
          contractTypeCatalogId: true,
          internalCode: true,
          monthlyValue: true
        }
      });
      if (!contract) throw new NotFoundException("Contrato não encontrado");
      if (!contract.startDate) {
        throw new BadRequestException(
          "Contrato sem data de início da vigência. Regularize a identificação antes de criar medições."
        );
      }

      // Compatibilidade: se o cliente enviar linhas manuais, respeita (fluxo antigo datacenter/infra).
      if (dto.items?.length) {
        const pricingItems = await this.resolvePricingItems(tx, dto.contractId, dto.items);
        return tx.measurement.create({
          data: {
            contractId: dto.contractId,
            referenceMonth: dto.referenceMonth,
            referenceYear: dto.referenceYear,
            items: {
              create: dto.items.map((item) => ({
                type: item.type,
                referenceId: item.referenceId,
                pricingItemId: item.pricingItemId,
                quantity: new Prisma.Decimal(item.quantity),
                calculatedValue: item.pricingItemId
                  ? new Prisma.Decimal(item.quantity).mul(pricingItems.get(item.pricingItemId)!.unitValue)
                  : new Prisma.Decimal(0),
                unitValueSnapshot: item.pricingItemId
                  ? pricingItems.get(item.pricingItemId)!.unitValue
                  : undefined,
                billingKindSnapshot: item.pricingItemId
                  ? pricingItems.get(item.pricingItemId)!.billingKind
                  : undefined
              }))
            }
          },
          include: { items: true, glosas: true }
        });
      }

      const window = competenceWindow(dto.referenceYear, dto.referenceMonth);
      const pricingItems = await tx.contractPricingItem.findMany({
        where: { contractId: dto.contractId, status: ContractPricingItemStatus.ACTIVE },
        include: { type: true },
        orderBy: { sequence: "asc" }
      });

      const composed = composeMeasurementLines({
        pricingItems,
        monthlyValue: contract.monthlyValue,
        window
      });

      if (composed.lines.length === 0) {
        throw new BadRequestException(
          composed.warning ??
            "Contrato sem itens contratuais vigentes nesta competência. Cadastre itens no contrato antes de criar a medição."
        );
      }

      return tx.measurement.create({
        data: {
          contractId: dto.contractId,
          referenceMonth: dto.referenceMonth,
          referenceYear: dto.referenceYear,
          items: {
            create: composed.lines.map((line) => ({
              type: line.type,
              referenceId: line.referenceId,
              pricingItemId: line.pricingItemId,
              quantity: line.quantity,
              calculatedValue: line.calculatedValue,
              descriptionSnapshot: line.descriptionSnapshot,
              unitValueSnapshot: line.unitValueSnapshot,
              billingKindSnapshot: line.billingKindSnapshot,
              periodicitySnapshot: line.periodicitySnapshot,
              coverageStart: line.coverageStart,
              coverageEnd: line.coverageEnd,
              isLegacyMonthly: line.isLegacyMonthly,
              calculationMemory: line.calculationMemory
            }))
          }
        },
        include: { items: true, glosas: true }
      });
    });
    await this.audit("Measurement", measurement.id, "CREATE", null, measurement);
    return measurement;
  }

  async findAll(): Promise<unknown> {
    return this.prisma.measurement.findMany({
      where: { deletedAt: null, ...this.organizationScope() },
      include: {
        contract: {
          select: {
            id: true,
            number: true,
            name: true,
            internalCode: true,
            formalNumber: true,
            contractYear: true,
            companyName: true,
            contractType: true,
            organization: { select: { id: true, name: true, acronym: true } },
            supplier: { select: { id: true, name: true, cnpj: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async findOne(id: string): Promise<unknown> {
    const m = await this.prisma.measurement.findFirst({
      where: { id, deletedAt: null, ...this.organizationScope() },
      include: {
        contract: {
          include: {
            organization: { select: { id: true, name: true, acronym: true } },
            supplier: { select: { id: true, name: true, cnpj: true } },
            services: true,
            pricingItems: {
              where: { status: ContractPricingItemStatus.ACTIVE },
              include: { type: true, unit: true },
              orderBy: { sequence: "asc" }
            }
          }
        },
        items: {
          include: {
            pricingItem: { include: { type: true, unit: true } },
            glosas: true
          },
          orderBy: { coverageStart: "asc" }
        },
        glosas: { orderBy: { createdAt: "asc" } },
        attachments: true
      }
    });
    if (!m) throw new NotFoundException("Medição não encontrada");

    const autoGlosas = m.glosas.filter((g) => g.origin === GlosaOrigin.AUTOMATIC);
    const manualGlosas = m.glosas.filter((g) => g.origin === GlosaOrigin.MANUAL);
    const totalAutoGlosed = autoGlosas.reduce((acc, g) => acc.add(g.value), new Prisma.Decimal(0));
    const totalManualGlosed = manualGlosas.reduce((acc, g) => acc.add(g.value), new Prisma.Decimal(0));

    return {
      ...m,
      financialSummary: {
        gross: m.totalMeasuredValue,
        automaticGlosas: totalAutoGlosed,
        manualGlosas: totalManualGlosed,
        net: m.totalApprovedValue
      }
    };
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
    if (m.status === MeasurementStatus.APPROVED) {
      throw new BadRequestException("Medição aprovada não pode ser alterada.");
    }
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
            : new Prisma.Decimal(0),
          unitValueSnapshot: row.pricingItemId ? pricingItems.get(row.pricingItemId)!.unitValue : undefined,
          billingKindSnapshot: row.pricingItemId ? pricingItems.get(row.pricingItemId)!.billingKind : undefined
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
    if (m.status === MeasurementStatus.APPROVED) {
      throw new BadRequestException("Medição aprovada não pode ser alterada.");
    }
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

  /** Atualiza a quantidade de uma linha; bloqueado apenas após aprovação. */
  async patchItem(measurementId: string, itemId: string, quantity: number): Promise<unknown> {
    const m = await this.prisma.measurement.findFirst({
      where: { id: measurementId, deletedAt: null },
      include: { items: true }
    });
    if (!m) throw new NotFoundException("Medição não encontrada");
    if (m.status === MeasurementStatus.APPROVED) {
      throw new BadRequestException("Medição aprovada não pode ser alterada.");
    }
    const item = m.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException("Linha não encontrada nesta medição");
    }
    await this.prisma.$transaction(async (tx) => {
      let calculatedValue = item.calculatedValue;
      if (item.pricingItemId) {
        const pricingItems = await this.resolvePricingItems(tx, m.contractId, [
          { quantity, pricingItemId: item.pricingItemId }
        ]);
        const unit = item.unitValueSnapshot ?? pricingItems.get(item.pricingItemId)!.unitValue;
        calculatedValue = new Prisma.Decimal(quantity).mul(unit);
      } else if (item.unitValueSnapshot) {
        calculatedValue = new Prisma.Decimal(quantity).mul(item.unitValueSnapshot);
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
            modules: { include: { features: true, glosaPricingItem: { include: { type: true } } } },
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

    const window = competenceWindow(measurement.referenceYear, measurement.referenceMonth);
    const hasComposedPricingLines = measurement.items.some(
      (item) =>
        item.type === MeasurementItemType.PRICING_ITEM ||
        item.isLegacyMonthly ||
        (item.pricingItemId != null && item.billingKindSnapshot != null)
    );

    let measured = new Prisma.Decimal(0);

    if (hasComposedPricingLines || measurement.items.some((i) => i.billingKindSnapshot || i.isLegacyMonthly)) {
      for (const item of measurement.items) {
        const billingKind =
          item.billingKindSnapshot ??
          item.pricingItem?.billingKind ??
          (item.isLegacyMonthly ? ContractPricingBillingKind.RECURRING : null);
        if (!billingKind) {
          // Linhas SERVICE legadas sem snapshot: fallback qty × unit
          const unit = item.unitValueSnapshot ?? item.pricingItem?.unitValue;
          if (unit) {
            const calc = item.quantity.mul(unit);
            measured = measured.add(calc);
            await this.prisma.measurementItem.update({
              where: { id: item.id },
              data: { calculatedValue: calc }
            });
          }
          continue;
        }

        const unitValue = item.unitValueSnapshot ?? item.pricingItem?.unitValue ?? new Prisma.Decimal(0);
        const periodicity =
          item.periodicitySnapshot ?? item.pricingItem?.periodicity ?? ContractPricingPeriodicity.MONTHLY;
        const description =
          item.descriptionSnapshot ?? item.pricingItem?.description ?? "Item da medição";

        if (billingKind === ContractPricingBillingKind.ON_DEMAND && item.pricingItemId) {
          await this.resolvePricingItems(this.prisma, measurement.contractId, [
            { quantity: Number(item.quantity), pricingItemId: item.pricingItemId }
          ]);
        }

        const result = calculateLineValue({
          billingKind,
          unitValue,
          periodicity,
          quantity: item.quantity,
          coverageStart: item.coverageStart,
          coverageEnd: item.coverageEnd,
          window,
          description
        });
        measured = measured.add(result.calculatedValue);
        await this.prisma.measurementItem.update({
          where: { id: item.id },
          data: {
            calculatedValue: result.calculatedValue,
            calculationMemory: result.calculationMemory,
            unitValueSnapshot: unitValue,
            billingKindSnapshot: billingKind,
            periodicitySnapshot: periodicity,
            descriptionSnapshot: description
          }
        });
      }
    } else {
      // Fallback legado (medições antigas sem composição por itens).
      measured = await this.calculateLegacyPath(measurement);
    }

    const autoGlosaValue = this.computeAutomaticFeatureGlosa(measurement, measured);
    await this.prisma.glosa.deleteMany({
      where: { measurementId: id, origin: GlosaOrigin.AUTOMATIC }
    });
    if (autoGlosaValue.gt(0)) {
      await this.prisma.glosa.create({
        data: {
          measurementId: id,
          type: GlosaType.NAO_ENTREGA,
          origin: GlosaOrigin.AUTOMATIC,
          value: autoGlosaValue,
          justification:
            "Glosa automática pela proporção de funcionalidades não validadas sobre a base de glosa da competência.",
          createdBy: "sistema"
        }
      });
    }

    const glosasAgg = await this.prisma.glosa.aggregate({
      where: { measurementId: id },
      _sum: { value: true }
    });
    const glosas = glosasAgg._sum.value ?? new Prisma.Decimal(0);
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
    return this.findOne(id);
  }

  async approve(id: string): Promise<unknown> {
    const measurement = await this.prisma.measurement.findFirst({
      where: { id, deletedAt: null },
      include: { items: { where: { pricingItemId: { not: null } } }, glosas: true }
    });
    if (!measurement) throw new NotFoundException("Medição não encontrada");
    if (measurement.status === MeasurementStatus.OPEN) {
      throw new BadRequestException("Calcule a medição antes de aprovar");
    }
    if (measurement.status === MeasurementStatus.APPROVED) {
      throw new BadRequestException("Medição já está aprovada");
    }
    if (measurement.status !== MeasurementStatus.UNDER_REVIEW && measurement.status !== MeasurementStatus.GLOSSED) {
      throw new BadRequestException("Calcule a medição antes de aprovar");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const consumptionByPricingItem = new Map<string, Prisma.Decimal>();
      for (const item of measurement.items) {
        if (!item.pricingItemId) continue;
        const billing =
          item.billingKindSnapshot ??
          (
            await tx.contractPricingItem.findFirst({
              where: { id: item.pricingItemId },
              select: { billingKind: true }
            })
          )?.billingKind;
        if (billing !== ContractPricingBillingKind.ON_DEMAND) continue;
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
    return this.findOne(id);
  }

  /** Glosa manual lançada a partir da tela da medição. */
  async addManualGlosa(
    measurementId: string,
    dto: {
      type: GlosaType;
      value: number;
      justification: string;
      measurementItemId?: string;
      createdBy?: string;
    }
  ): Promise<unknown> {
    const measurement = await this.prisma.measurement.findFirst({
      where: { id: measurementId, deletedAt: null },
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
    if (dto.measurementItemId) {
      const item = measurement.items.find((i) => i.id === dto.measurementItemId);
      if (!item) throw new BadRequestException("Linha da medição inválida para a glosa.");
    }
    const createdBy = dto.createdBy?.trim() || getAuditActorLabel();
    const glosa = await this.prisma.glosa.create({
      data: {
        measurementId,
        measurementItemId: dto.measurementItemId,
        type: dto.type,
        origin: GlosaOrigin.MANUAL,
        value: new Prisma.Decimal(dto.value),
        justification,
        createdBy
      }
    });
    if (dto.measurementItemId) {
      await this.prisma.measurementItem.update({
        where: { id: dto.measurementItemId },
        data: { glosedValue: { increment: dto.value } }
      });
    }
    await this.refreshGlosaTotals(measurementId);
    await this.audit("Glosa", glosa.id, "CREATE", null, glosa);
    return this.findOne(measurementId);
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

  private async refreshGlosaTotals(measurementId: string): Promise<void> {
    const measurement = await this.prisma.measurement.findFirst({ where: { id: measurementId, deletedAt: null } });
    if (!measurement || measurement.status === MeasurementStatus.APPROVED) return;
    if (measurement.totalMeasuredValue.lte(0) && measurement.status === MeasurementStatus.OPEN) return;

    const totalGlosas = await this.prisma.glosa.aggregate({
      where: { measurementId },
      _sum: { value: true }
    });
    const glosed = totalGlosas._sum.value ?? new Prisma.Decimal(0);
    const approvedRaw = measurement.totalMeasuredValue.sub(glosed);
    const approved = approvedRaw.lt(0) ? new Prisma.Decimal(0) : approvedRaw;
    await this.prisma.measurement.update({
      where: { id: measurementId },
      data: {
        totalGlosedValue: glosed,
        totalApprovedValue: approved,
        status: glosed.gt(0) ? MeasurementStatus.GLOSSED : MeasurementStatus.UNDER_REVIEW
      }
    });
  }

  /**
   * Glosa automática por funcionalidades não validadas (SOFTWARE/SERVICO).
   * Calcula sobre a base de glosa; se não houver funcionalidades, retorna 0.
   */
  private computeAutomaticFeatureGlosa(
    measurement: {
      contract: {
        contractType: string;
        monthlyValue: Prisma.Decimal;
        modules: Array<{
          glosaPricingItemId: string | null;
          features: Array<{ status: string }>;
          glosaPricingItem: {
            id: string;
            unitValue: Prisma.Decimal;
            billingKind: ContractPricingBillingKind;
            periodicity: ContractPricingPeriodicity | null;
            type?: { code: string } | null;
          } | null;
        }>;
        pricingItems: Array<{
          id: string;
          unitValue: Prisma.Decimal;
          totalValue: Prisma.Decimal;
          billingKind: ContractPricingBillingKind;
          periodicity: ContractPricingPeriodicity | null;
          includeInGlosaBase: boolean;
          type: { code: string; participatesInGlosa: boolean };
        }>;
      };
    },
    _measuredGross: Prisma.Decimal
  ): Prisma.Decimal {
    const contractType = measurement.contract.contractType;
    if (contractType !== "SOFTWARE" && contractType !== "SERVICO") {
      return new Prisma.Decimal(0);
    }

    const monthlyEq = (item: {
      unitValue: Prisma.Decimal;
      billingKind: ContractPricingBillingKind;
      periodicity: ContractPricingPeriodicity | null;
    }) => {
      if (item.billingKind !== ContractPricingBillingKind.RECURRING) return new Prisma.Decimal(0);
      return monthlyEquivalentValue(item.unitValue, item.periodicity);
    };

    const modulesWithLink = measurement.contract.modules.filter((module) => module.glosaPricingItemId);
    let undelivered = new Prisma.Decimal(0);

    if (modulesWithLink.length > 0) {
      for (const module of modulesWithLink) {
        const total = module.features.length;
        if (total === 0) continue;
        const validated = module.features.filter((feature) => feature.status === "VALIDATED").length;
        const missingRatio = new Prisma.Decimal(total - validated).div(total);
        const baseItem = measurement.contract.pricingItems.find((item) => item.id === module.glosaPricingItemId);
        if (baseItem) undelivered = undelivered.add(monthlyEq(baseItem).mul(missingRatio));
      }
    } else {
      const features = measurement.contract.modules.flatMap((module) => module.features);
      const total = features.length;
      if (total === 0) return new Prisma.Decimal(0);
      const validated = features.filter((feature) => feature.status === "VALIDATED").length;
      const missingRatio = new Prisma.Decimal(total - validated).div(total);
      const explicitGlosaBases = measurement.contract.pricingItems.filter((item) => item.includeInGlosaBase);
      const explicitBaseValue = explicitGlosaBases.reduce(
        (sum, item) => sum.add(monthlyEq(item)),
        new Prisma.Decimal(0)
      );
      const compatibleGlosaBase = measurement.contract.pricingItems.find(
        (item) => item.type.participatesInGlosa || item.type.code === "MENSALIDADE"
      );
      const glosaBase =
        explicitGlosaBases.length > 0
          ? explicitBaseValue
          : compatibleGlosaBase
            ? monthlyEq(compatibleGlosaBase)
            : measurement.contract.monthlyValue;
      undelivered = glosaBase.mul(missingRatio);
    }

    return undelivered.gt(0) ? new Prisma.Decimal(undelivered.toFixed(2)) : new Prisma.Decimal(0);
  }

  /** Caminho antigo para medições sem linhas compostas por precificação. */
  private async calculateLegacyPath(measurement: {
    id: string;
    contract: {
      contractType: string;
      monthlyValue: Prisma.Decimal;
      modules: Array<{
        glosaPricingItemId: string | null;
        features: Array<{ status: string }>;
        glosaPricingItem: {
          id: string;
          unitValue: Prisma.Decimal;
          billingKind: ContractPricingBillingKind;
          periodicity: ContractPricingPeriodicity | null;
        } | null;
      }>;
      services: Array<{ id: string; unitValue: Prisma.Decimal }>;
      pricingItems: Array<{
        id: string;
        unitValue: Prisma.Decimal;
        totalValue: Prisma.Decimal;
        billingKind: ContractPricingBillingKind;
        periodicity: ContractPricingPeriodicity | null;
        includeInGlosaBase: boolean;
        type: { code: string; participatesInGlosa: boolean };
      }>;
    };
    items: Array<{
      id: string;
      type: MeasurementItemType;
      referenceId: string;
      pricingItemId: string | null;
      quantity: Prisma.Decimal;
      calculatedValue: Prisma.Decimal;
      pricingItem: { unitValue: Prisma.Decimal } | null;
    }>;
  }): Promise<Prisma.Decimal> {
    const contractType = measurement.contract.contractType;
    let measured = new Prisma.Decimal(0);

    if (contractType === "SOFTWARE" || contractType === "SERVICO") {
      const monthlyEquivalent = (item: (typeof measurement.contract.pricingItems)[number]) => {
        if (item.billingKind !== ContractPricingBillingKind.RECURRING) return new Prisma.Decimal(0);
        return monthlyEquivalentValue(item.unitValue, item.periodicity);
      };
      const modulesWithLink = measurement.contract.modules.filter((module) => module.glosaPricingItemId);

      if (modulesWithLink.length > 0) {
        for (const module of modulesWithLink) {
          const total = module.features.length;
          const validated = module.features.filter((feature) => feature.status === "VALIDATED").length;
          const percentual = total > 0 ? new Prisma.Decimal(validated).div(total) : new Prisma.Decimal(0);
          const baseItem = measurement.contract.pricingItems.find((item) => item.id === module.glosaPricingItemId);
          if (baseItem) measured = measured.add(monthlyEquivalent(baseItem).mul(percentual));
        }
      } else {
        const features = measurement.contract.modules.flatMap((module) => module.features);
        const total = features.length;
        const validated = features.filter((feature) => feature.status === "VALIDATED").length;
        const percentual = total > 0 ? new Prisma.Decimal(validated).div(total) : new Prisma.Decimal(0);
        const explicitGlosaBases = measurement.contract.pricingItems.filter((item) => item.includeInGlosaBase);
        const explicitBaseValue = explicitGlosaBases.reduce(
          (sum, item) => sum.add(monthlyEquivalent(item)),
          new Prisma.Decimal(0)
        );
        const compatibleGlosaBase = measurement.contract.pricingItems.find(
          (item) => item.type.participatesInGlosa || item.type.code === "MENSALIDADE"
        );
        const glosaBase = explicitGlosaBases.length > 0 ? explicitBaseValue : compatibleGlosaBase?.totalValue;
        measured = (glosaBase?.gt(0) ? glosaBase : measurement.contract.monthlyValue).mul(percentual);
      }
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
    return measured;
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
   * Escopo pelo órgão do contexto ativo (sem bypass automático por ADMIN).
   */
  private organizationScope(): Prisma.MeasurementWhereInput {
    const actor = requestActorStore.getStore();
    if (actor?.allOrganizationsActive || !actor?.organizationId) {
      return {};
    }
    return { contract: { is: { organizationId: actor.organizationId } } };
  }

  /**
   * Confere que os itens informados estão ativos e pertencem ao contrato.
   * Para itens sob demanda, a quantidade lançada não pode ultrapassar o saldo já contratado.
   */
  private async resolvePricingItems(
    tx: Prisma.TransactionClient | PrismaService,
    contractId: string,
    rows: Array<{ pricingItemId?: string; quantity: number }>
  ): Promise<
    Map<
      string,
      {
        billingKind: ContractPricingBillingKind;
        quantity: Prisma.Decimal;
        consumedQuantity: Prisma.Decimal;
        unitValue: Prisma.Decimal;
      }
    >
  > {
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
