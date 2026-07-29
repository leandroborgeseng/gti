import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import {
  ContractPricingBillingKind,
  ContractPricingItemStatus,
  ContractPricingPeriodicity,
  Prisma
} from "@prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";

export type PricingItemInput = {
  id?: string;
  sequence?: number;
  typeId: string;
  description: string;
  unitId: string;
  quantity: number;
  unitValue: number;
  totalValue?: number;
  totalManual?: boolean;
  totalJustification?: string | null;
  billingKind: ContractPricingBillingKind | keyof typeof ContractPricingBillingKind;
  periodicity?: ContractPricingPeriodicity | keyof typeof ContractPricingPeriodicity | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  status?: ContractPricingItemStatus | keyof typeof ContractPricingItemStatus;
};

export type PricingTotals = {
  recurringPredicted: number;
  oneTime: number;
  onDemand: number;
  globalEstimated: number;
  monthlyValue: number;
  installationValue: number | null;
};

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function num(d: Prisma.Decimal | number | string): number {
  return Number(d);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function serializePricingAudit(item: {
  id: string;
  contractId: string;
  sequence: number;
  typeId: string;
  description: string;
  unitId: string;
  quantity: Prisma.Decimal | number;
  unitValue: Prisma.Decimal | number;
  totalValue: Prisma.Decimal | number;
  totalManual: boolean;
  totalJustification: string | null;
  billingKind: ContractPricingBillingKind;
  periodicity: ContractPricingPeriodicity | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  status: ContractPricingItemStatus;
  type?: { code: string; label: string } | null;
  unit?: { code: string; label: string } | null;
}) {
  return {
    id: item.id,
    contractId: item.contractId,
    sequence: item.sequence,
    typeId: item.typeId,
    typeCode: item.type?.code ?? null,
    typeLabel: item.type?.label ?? null,
    description: item.description,
    unitId: item.unitId,
    unitCode: item.unit?.code ?? null,
    unitLabel: item.unit?.label ?? null,
    quantity: num(item.quantity),
    unitValue: num(item.unitValue),
    totalValue: num(item.totalValue),
    totalManual: item.totalManual,
    totalJustification: item.totalJustification,
    billingKind: item.billingKind,
    periodicity: item.periodicity,
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
    status: item.status
  };
}

function computedTotal(quantity: number, unitValue: number): number {
  return round2(quantity * unitValue);
}

export function summarizePricingItems(
  items: Array<{
    quantity: Prisma.Decimal | number;
    unitValue: Prisma.Decimal | number;
    totalValue: Prisma.Decimal | number;
    billingKind: ContractPricingBillingKind;
    periodicity: ContractPricingPeriodicity | null;
    status: ContractPricingItemStatus;
  }>
): PricingTotals {
  let recurringPredicted = 0;
  let oneTime = 0;
  let onDemand = 0;
  let monthlyValue = 0;
  let installationValue = 0;

  for (const item of items) {
    if (item.status !== ContractPricingItemStatus.ACTIVE) continue;
    const total = num(item.totalValue);
    const unit = num(item.unitValue);
    if (item.billingKind === ContractPricingBillingKind.RECURRING) {
      recurringPredicted += total;
      if (item.periodicity === ContractPricingPeriodicity.MONTHLY) {
        monthlyValue += unit;
      } else if (item.periodicity === ContractPricingPeriodicity.BIMONTHLY) {
        monthlyValue += unit / 2;
      } else if (item.periodicity === ContractPricingPeriodicity.QUARTERLY) {
        monthlyValue += unit / 3;
      } else if (item.periodicity === ContractPricingPeriodicity.SEMIANNUAL) {
        monthlyValue += unit / 6;
      } else if (item.periodicity === ContractPricingPeriodicity.ANNUAL) {
        monthlyValue += unit / 12;
      } else {
        monthlyValue += unit;
      }
    } else if (item.billingKind === ContractPricingBillingKind.ONE_TIME) {
      oneTime += total;
      installationValue += total;
    } else {
      onDemand += total;
    }
  }

  return {
    recurringPredicted: round2(recurringPredicted),
    oneTime: round2(oneTime),
    onDemand: round2(onDemand),
    globalEstimated: round2(recurringPredicted + oneTime + onDemand),
    monthlyValue: round2(Math.max(monthlyValue, 0)),
    installationValue: installationValue > 0 ? round2(installationValue) : null
  };
}

function normalizeItem(input: PricingItemInput, sequence: number): {
  sequence: number;
  typeId: string;
  description: string;
  unitId: string;
  quantity: Prisma.Decimal;
  unitValue: Prisma.Decimal;
  totalValue: Prisma.Decimal;
  totalManual: boolean;
  totalJustification: string | null;
  billingKind: ContractPricingBillingKind;
  periodicity: ContractPricingPeriodicity | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  status: ContractPricingItemStatus;
} {
  const description = input.description?.trim() ?? "";
  if (!description) throw new BadRequestException("Informe a descrição contratual do item.");
  if (!input.typeId?.trim()) throw new BadRequestException("Selecione o tipo padronizado do item.");
  if (!input.unitId?.trim()) throw new BadRequestException("Selecione a unidade de medida do item.");

  const quantity = Number(input.quantity);
  const unitValue = Number(input.unitValue);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new BadRequestException("Quantidade inválida no item contratual.");
  }
  if (!Number.isFinite(unitValue) || unitValue < 0) {
    throw new BadRequestException("Valor unitário inválido no item contratual.");
  }

  const totalManual = Boolean(input.totalManual);
  const expected = computedTotal(quantity, unitValue);
  let totalValue = expected;
  let totalJustification: string | null = null;

  if (totalManual) {
    const manual = Number(input.totalValue);
    if (!Number.isFinite(manual) || manual < 0) {
      throw new BadRequestException("Valor total manual inválido.");
    }
    totalValue = round2(manual);
    totalJustification = (input.totalJustification ?? "").trim() || null;
    if (Math.abs(totalValue - expected) > 0.009 && !totalJustification) {
      throw new BadRequestException(
        "Quando o valor total diverge de quantidade × valor unitário, informe a justificativa."
      );
    }
  }

  const billingKind = input.billingKind as ContractPricingBillingKind;
  if (!Object.values(ContractPricingBillingKind).includes(billingKind)) {
    throw new BadRequestException("Tipo de cobrança inválido.");
  }

  let periodicity: ContractPricingPeriodicity | null = null;
  if (billingKind === ContractPricingBillingKind.RECURRING) {
    periodicity = (input.periodicity as ContractPricingPeriodicity) ?? ContractPricingPeriodicity.MONTHLY;
    if (!Object.values(ContractPricingPeriodicity).includes(periodicity)) {
      throw new BadRequestException("Periodicidade inválida.");
    }
  }

  const status = (input.status as ContractPricingItemStatus) ?? ContractPricingItemStatus.ACTIVE;

  return {
    sequence,
    typeId: input.typeId.trim(),
    description,
    unitId: input.unitId.trim(),
    quantity: dec(quantity),
    unitValue: dec(unitValue),
    totalValue: dec(totalValue),
    totalManual,
    totalJustification,
    billingKind,
    periodicity,
    periodStart: input.periodStart ? new Date(input.periodStart) : null,
    periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
    status
  };
}

export class ContractPricingHelper {
  constructor(private readonly prisma: PrismaService) {}

  async listTypes(includeInactive = false) {
    return this.prisma.contractItemType.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }]
    });
  }

  async listUnits(includeInactive = false) {
    return this.prisma.measureUnit.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }]
    });
  }

  async createUnit(input: { code: string; label: string }) {
    const code = input.code.trim().toUpperCase().replace(/\s+/g, "_");
    const label = input.label.trim();
    if (!code || !label) throw new BadRequestException("Informe código e rótulo da unidade.");
    try {
      return await this.prisma.measureUnit.create({
        data: { code, label, active: true, sortOrder: 500 }
      });
    } catch {
      throw new ConflictException("Já existe uma unidade com este código.");
    }
  }

  async createType(input: { code: string; label: string }) {
    const code = input.code.trim().toUpperCase().replace(/\s+/g, "_");
    const label = input.label.trim();
    if (!code || !label) throw new BadRequestException("Informe código e rótulo do tipo.");
    try {
      return await this.prisma.contractItemType.create({
        data: { code, label, active: true, sortOrder: 500 }
      });
    } catch {
      throw new ConflictException("Já existe um tipo com este código.");
    }
  }

  async listTypesAdmin() {
    return this.prisma.contractItemType.findMany({
      include: { suggestedUnit: true, _count: { select: { items: true } } },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }]
    });
  }

  async createTypeAdmin(input: {
    code: string;
    label: string;
    description?: string;
    billingKind?: ContractPricingBillingKind | null;
    suggestedUnitId?: string | null;
    participatesInGlosa?: boolean;
    useInMeasurements?: boolean;
    useInBalanceControl?: boolean;
    useInConsumption?: boolean;
    useInFinancialPlanning?: boolean;
    infoOnly?: boolean;
    active?: boolean;
    sortOrder?: number;
  }) {
    const code = input.code.trim().toUpperCase().replace(/\s+/g, "_");
    const label = input.label.trim();
    if (!code || !label) throw new BadRequestException("Informe código e rótulo do tipo.");
    if (input.suggestedUnitId) {
      await this.ensureUnit(input.suggestedUnitId);
    }
    try {
      return await this.prisma.contractItemType.create({
        data: {
          code,
          label,
          description: input.description?.trim() || null,
          billingKind: input.billingKind ?? null,
          suggestedUnitId: input.suggestedUnitId ?? null,
          participatesInGlosa: input.participatesInGlosa ?? false,
          useInMeasurements: input.useInMeasurements ?? true,
          useInBalanceControl: input.useInBalanceControl ?? false,
          useInConsumption: input.useInConsumption ?? false,
          useInFinancialPlanning: input.useInFinancialPlanning ?? false,
          infoOnly: input.infoOnly ?? false,
          active: input.active ?? true,
          sortOrder: input.sortOrder ?? 500
        },
        include: { suggestedUnit: true }
      });
    } catch {
      throw new ConflictException("Já existe um tipo com este código.");
    }
  }

  async updateTypeAdmin(
    id: string,
    input: {
      label?: string;
      description?: string | null;
      billingKind?: ContractPricingBillingKind | null;
      suggestedUnitId?: string | null;
      participatesInGlosa?: boolean;
      useInMeasurements?: boolean;
      useInBalanceControl?: boolean;
      useInConsumption?: boolean;
      useInFinancialPlanning?: boolean;
      infoOnly?: boolean;
      active?: boolean;
      sortOrder?: number;
    }
  ) {
    const prev = await this.prisma.contractItemType.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } }
    });
    if (!prev) throw new NotFoundException("Tipo de item não encontrado.");
    if (input.active === false && prev._count.items > 0) {
      // soft inactivate — permitido mesmo com vínculos
    }
    if (input.suggestedUnitId) {
      await this.ensureUnit(input.suggestedUnitId);
    }
    return this.prisma.contractItemType.update({
      where: { id },
      data: {
        label: input.label?.trim() || undefined,
        description: input.description === undefined ? undefined : input.description?.trim() || null,
        billingKind: input.billingKind === undefined ? undefined : input.billingKind,
        suggestedUnitId: input.suggestedUnitId === undefined ? undefined : input.suggestedUnitId,
        participatesInGlosa: input.participatesInGlosa ?? undefined,
        useInMeasurements: input.useInMeasurements ?? undefined,
        useInBalanceControl: input.useInBalanceControl ?? undefined,
        useInConsumption: input.useInConsumption ?? undefined,
        useInFinancialPlanning: input.useInFinancialPlanning ?? undefined,
        infoOnly: input.infoOnly ?? undefined,
        active: input.active ?? undefined,
        sortOrder: input.sortOrder ?? undefined
      },
      include: { suggestedUnit: true, _count: { select: { items: true } } }
    });
  }

  private async ensureUnit(unitId: string): Promise<void> {
    const unit = await this.prisma.measureUnit.findUnique({ where: { id: unitId } });
    if (!unit) throw new BadRequestException("Unidade de medida sugerida não encontrada.");
  }

  async listItems(contractId: string) {
    return this.prisma.contractPricingItem.findMany({
      where: { contractId },
      include: { type: true, unit: true },
      orderBy: { sequence: "asc" }
    });
  }

  async contractHasMovements(contractId: string): Promise<boolean> {
    const [measurements, amendments, snapshots] = await Promise.all([
      this.prisma.measurement.count({ where: { contractId } }),
      this.prisma.contractAmendment.count({ where: { contractId } }),
      this.prisma.contractFinancialSnapshot.count({ where: { contractId } })
    ]);
    return measurements + amendments + snapshots > 0;
  }

  async replaceItems(
    contractId: string,
    items: PricingItemInput[],
    audit: (action: string, oldData: unknown, newData: unknown) => Promise<void>
  ) {
    const hasMovements = await this.contractHasMovements(contractId);
    const existing = await this.listItems(contractId);
    const existingById = new Map(existing.map((e) => [e.id, e]));

    if (hasMovements) {
      // Com movimentações: não remover linhas existentes; só atualizar / cancelar / acrescentar.
      const keptIds = new Set(items.map((i) => i.id).filter(Boolean) as string[]);
      for (const prev of existing) {
        if (!keptIds.has(prev.id) && prev.status === ContractPricingItemStatus.ACTIVE) {
          throw new BadRequestException(
            "Não é possível excluir itens após medições, aditivos ou memória financeira. Cancele o item."
          );
        }
      }
    }

    const normalized = items.map((item, idx) => normalizeItem(item, item.sequence ?? idx + 1));
    const totals = summarizePricingItems(
      normalized.map((n) => ({
        quantity: n.quantity,
        unitValue: n.unitValue,
        totalValue: n.totalValue,
        billingKind: n.billingKind,
        periodicity: n.periodicity,
        status: n.status
      }))
    );

    if (totals.monthlyValue <= 0 && normalized.some((n) => n.status === ContractPricingItemStatus.ACTIVE)) {
      // permitir contratos só com itens únicos/sob demanda: monthlyValue mínimo 0.01 para schema NOT NULL? Schema requires monthlyValue > 0 historically.
      // Keep at least 0 — schema allows Min(0) in DTO; DB has Decimal without check. Use 0.
    }

    await this.prisma.$transaction(async (tx) => {
      const keptIds = [...new Set(items.map((i) => i.id).filter(Boolean) as string[])];
      if (!hasMovements) {
        if (keptIds.length === 0) {
          await tx.contractPricingItem.deleteMany({ where: { contractId } });
        } else {
          await tx.contractPricingItem.deleteMany({
            where: { contractId, id: { notIn: keptIds } }
          });
        }
      }
      for (let i = 0; i < items.length; i++) {
        const raw = items[i];
        const n = normalized[i];
        if (raw.id && existingById.has(raw.id)) {
          await tx.contractPricingItem.update({
            where: { id: raw.id },
            data: n
          });
        } else {
          await tx.contractPricingItem.create({
            data: { contractId, ...n }
          });
        }
      }

      const contractRow = await tx.contract.findUnique({
        where: { id: contractId },
        select: { globalValueManual: true, globalValueOriginal: true }
      });
      const globalEstimated = dec(Math.max(totals.globalEstimated, totals.monthlyValue, 0));
      await tx.contract.update({
        where: { id: contractId },
        data: {
          monthlyValue: dec(Math.max(totals.monthlyValue, 0)),
          installationValue: totals.installationValue != null ? dec(totals.installationValue) : null,
          totalValue: globalEstimated,
          ...(contractRow?.globalValueManual
            ? {}
            : {
                globalValueCurrent: globalEstimated,
                ...(contractRow?.globalValueOriginal == null ? { globalValueOriginal: globalEstimated } : {})
              })
        }
      });
    });

    const next = await this.listItems(contractId);
    const nextById = new Map(next.map((n) => [n.id, n]));
    for (const prev of existing) {
      const cur = nextById.get(prev.id);
      if (!cur) {
        await audit("DELETE", serializePricingAudit(prev), null);
      } else if (prev.status !== cur.status && cur.status === ContractPricingItemStatus.CANCELLED) {
        await audit("CANCEL", serializePricingAudit(prev), serializePricingAudit(cur));
      } else if (JSON.stringify(serializePricingAudit(prev)) !== JSON.stringify(serializePricingAudit(cur))) {
        await audit("UPDATE", serializePricingAudit(prev), serializePricingAudit(cur));
      }
      nextById.delete(prev.id);
    }
    for (const created of nextById.values()) {
      await audit("CREATE", null, serializePricingAudit(created));
    }
    return { items: next, totals: summarizePricingItems(next) };
  }

  async syncContractTotalsFromItems(contractId: string) {
    const items = await this.listItems(contractId);
    const totals = summarizePricingItems(items);
    await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        monthlyValue: dec(Math.max(totals.monthlyValue, 0)),
        installationValue: totals.installationValue != null ? dec(totals.installationValue) : null,
        totalValue: dec(Math.max(totals.globalEstimated, totals.monthlyValue, 0))
      }
    });
    return totals;
  }

  async ensureContract(contractId: string) {
    const c = await this.prisma.contract.findFirst({ where: { id: contractId, deletedAt: null } });
    if (!c) throw new NotFoundException("Contrato não encontrado.");
    return c;
  }
}
