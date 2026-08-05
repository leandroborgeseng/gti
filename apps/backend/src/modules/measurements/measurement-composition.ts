import {
  ContractPricingBillingKind,
  ContractPricingItemStatus,
  ContractPricingPeriodicity,
  MeasurementItemType,
  Prisma
} from "@prisma/client";
import { addUtcDays, isPricingItemEffectiveOn, startOfUtcDay } from "../contracts/contract-pricing.helper";

export type PricingItemForComposition = {
  id: string;
  description: string;
  unitValue: Prisma.Decimal;
  totalValue: Prisma.Decimal;
  quantity: Prisma.Decimal;
  billingKind: ContractPricingBillingKind;
  periodicity: ContractPricingPeriodicity | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  status: ContractPricingItemStatus;
  includeInGlosaBase: boolean;
  type?: { code: string; label: string; participatesInGlosa?: boolean } | null;
};

export type CompetenceWindow = {
  year: number;
  month: number;
  start: Date;
  end: Date;
  daysInMonth: number;
};

export type ComposedMeasurementLine = {
  type: MeasurementItemType;
  referenceId: string;
  pricingItemId: string | null;
  quantity: Prisma.Decimal;
  calculatedValue: Prisma.Decimal;
  descriptionSnapshot: string;
  unitValueSnapshot: Prisma.Decimal;
  billingKindSnapshot: ContractPricingBillingKind;
  periodicitySnapshot: ContractPricingPeriodicity | null;
  coverageStart: Date;
  coverageEnd: Date;
  isLegacyMonthly: boolean;
  calculationMemory: Prisma.InputJsonValue | undefined;
};

/** Limites civis UTC da competência (mês/ano). */
export function competenceWindow(year: number, month: number): CompetenceWindow {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { year, month, start, end, daysInMonth: end.getUTCDate() };
}

/** Interseção entre vigência do item e a competência; null se não há sobreposição. */
export function coverageInCompetence(
  item: { periodStart?: Date | string | null; periodEnd?: Date | string | null; status: ContractPricingItemStatus },
  window: CompetenceWindow
): { start: Date; end: Date; days: number } | null {
  if (item.status !== ContractPricingItemStatus.ACTIVE) return null;
  // Vigente em algum dia do mês: testa início, fim e um dia no meio se necessário.
  let overlaps = false;
  for (let day = 1; day <= window.daysInMonth; day++) {
    const at = new Date(Date.UTC(window.year, window.month - 1, day));
    if (isPricingItemEffectiveOn(item, at)) {
      overlaps = true;
      break;
    }
  }
  if (!overlaps) return null;

  const itemStart = item.periodStart ? startOfUtcDay(new Date(item.periodStart)) : window.start;
  const itemEnd = item.periodEnd ? startOfUtcDay(new Date(item.periodEnd)) : window.end;
  const start = itemStart > window.start ? itemStart : window.start;
  const end = itemEnd < window.end ? itemEnd : window.end;
  if (start > end) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return { start, end, days: Math.max(days, 0) };
}

export function monthlyEquivalentValue(
  unitValue: Prisma.Decimal,
  periodicity: ContractPricingPeriodicity | null
): Prisma.Decimal {
  const divisor: Record<ContractPricingPeriodicity, number> = {
    [ContractPricingPeriodicity.MONTHLY]: 1,
    [ContractPricingPeriodicity.BIMONTHLY]: 2,
    [ContractPricingPeriodicity.QUARTERLY]: 3,
    [ContractPricingPeriodicity.SEMIANNUAL]: 6,
    [ContractPricingPeriodicity.ANNUAL]: 12,
    [ContractPricingPeriodicity.CUSTOM]: 1
  };
  return unitValue.div(divisor[periodicity ?? ContractPricingPeriodicity.MONTHLY]);
}

function isMonthlyEquivalentItem(item: PricingItemForComposition): boolean {
  if (item.billingKind !== ContractPricingBillingKind.RECURRING) return false;
  if (item.includeInGlosaBase) return true;
  if (item.type?.code === "MENSALIDADE" || item.type?.participatesInGlosa) return true;
  return (item.periodicity ?? ContractPricingPeriodicity.MONTHLY) === ContractPricingPeriodicity.MONTHLY;
}

/**
 * Compõe linhas da medição a partir dos itens vigentes (total ou parcialmente) na competência.
 * Versões distintas (aditivo no meio do mês) já são linhas separadas com coverage clipped.
 */
export function composeMeasurementLines(params: {
  pricingItems: PricingItemForComposition[];
  monthlyValue: Prisma.Decimal;
  window: CompetenceWindow;
}): { lines: ComposedMeasurementLine[]; warning?: string } {
  const { pricingItems, monthlyValue, window } = params;
  const lines: ComposedMeasurementLine[] = [];

  for (const item of pricingItems) {
    const coverage = coverageInCompetence(item, window);
    if (!coverage || coverage.days <= 0) continue;

    const defaultQty =
      item.billingKind === ContractPricingBillingKind.RECURRING
        ? new Prisma.Decimal(1)
        : new Prisma.Decimal(0);

    lines.push({
      type: MeasurementItemType.PRICING_ITEM,
      referenceId: item.id,
      pricingItemId: item.id,
      quantity: defaultQty,
      calculatedValue: new Prisma.Decimal(0),
      descriptionSnapshot: item.description,
      unitValueSnapshot: item.unitValue,
      billingKindSnapshot: item.billingKind,
      periodicitySnapshot: item.periodicity,
      coverageStart: coverage.start,
      coverageEnd: coverage.end,
      isLegacyMonthly: false,
      calculationMemory: {
        composedAt: new Date().toISOString(),
        competence: { year: window.year, month: window.month, daysInMonth: window.daysInMonth },
        coverageDays: coverage.days,
        note: "Valores serão calculados ao executar «Calcular medição»."
      }
    });
  }

  const hasMonthlyEquivalent = lines.some((line) => {
    if (line.billingKindSnapshot !== ContractPricingBillingKind.RECURRING) return false;
    const src = pricingItems.find((p) => p.id === line.pricingItemId);
    return src ? isMonthlyEquivalentItem(src) : false;
  });

  if (lines.length === 0) {
    if (monthlyValue.gt(0)) {
      lines.push({
        type: MeasurementItemType.PRICING_ITEM,
        referenceId: `legacy-monthly-${window.year}-${window.month}`,
        pricingItemId: null,
        quantity: new Prisma.Decimal(1),
        calculatedValue: new Prisma.Decimal(0),
        descriptionSnapshot: "Mensalidade legada (contrato sem itens contratuais na competência)",
        unitValueSnapshot: monthlyValue,
        billingKindSnapshot: ContractPricingBillingKind.RECURRING,
        periodicitySnapshot: ContractPricingPeriodicity.MONTHLY,
        coverageStart: window.start,
        coverageEnd: window.end,
        isLegacyMonthly: true,
        calculationMemory: {
          composedAt: new Date().toISOString(),
          legacy: true,
          source: "contract.monthlyValue",
          competence: { year: window.year, month: window.month, daysInMonth: window.daysInMonth }
        }
      });
      return {
        lines,
        warning:
          "Contrato sem itens contratuais vigentes nesta competência. Foi criada uma linha legada a partir do valor mensal cadastrado."
      };
    }
    return {
      lines: [],
      warning:
        "Contrato sem itens contratuais vigentes nesta competência e sem valor mensal legado. Cadastre itens no contrato antes de criar a medição."
    };
  }

  if (monthlyValue.gt(0) && !hasMonthlyEquivalent) {
    // Mensalidade legada residual apenas quando não há item recorrente equivalente.
    lines.push({
      type: MeasurementItemType.PRICING_ITEM,
      referenceId: `legacy-monthly-${window.year}-${window.month}`,
      pricingItemId: null,
      quantity: new Prisma.Decimal(1),
      calculatedValue: new Prisma.Decimal(0),
      descriptionSnapshot: "Mensalidade legada (sem item equivalente na precificação)",
      unitValueSnapshot: monthlyValue,
      billingKindSnapshot: ContractPricingBillingKind.RECURRING,
      periodicitySnapshot: ContractPricingPeriodicity.MONTHLY,
      coverageStart: window.start,
      coverageEnd: window.end,
      isLegacyMonthly: true,
      calculationMemory: {
        composedAt: new Date().toISOString(),
        legacy: true,
        source: "contract.monthlyValue",
        competence: { year: window.year, month: window.month, daysInMonth: window.daysInMonth }
      }
    });
  }

  return { lines };
}

export type ItemCalculationResult = {
  calculatedValue: Prisma.Decimal;
  calculationMemory: Prisma.InputJsonValue;
};

/** Calcula o valor bruto de uma linha conforme a modalidade (MVP). */
export function calculateLineValue(params: {
  billingKind: ContractPricingBillingKind;
  unitValue: Prisma.Decimal;
  periodicity: ContractPricingPeriodicity | null;
  quantity: Prisma.Decimal;
  coverageStart: Date | null;
  coverageEnd: Date | null;
  window: CompetenceWindow;
  description: string;
}): ItemCalculationResult {
  const { billingKind, unitValue, periodicity, quantity, window, description } = params;
  const coverageStart = params.coverageStart ? startOfUtcDay(params.coverageStart) : window.start;
  const coverageEnd = params.coverageEnd ? startOfUtcDay(params.coverageEnd) : window.end;
  const coverageDays = Math.max(
    0,
    Math.round((coverageEnd.getTime() - coverageStart.getTime()) / 86_400_000) + 1
  );

  if (billingKind === ContractPricingBillingKind.RECURRING) {
    const monthlyEq = monthlyEquivalentValue(unitValue, periodicity);
    const fullMonth = coverageDays >= window.daysInMonth;
    const proportion = fullMonth ? 1 : coverageDays / window.daysInMonth;
    const value = monthlyEq.mul(proportion);
    return {
      calculatedValue: roundMoney(value),
      calculationMemory: {
        modality: "RECURRING",
        description,
        unitValue: Number(unitValue),
        periodicity: periodicity ?? ContractPricingPeriodicity.MONTHLY,
        monthlyEquivalent: Number(monthlyEq),
        coverageStart: coverageStart.toISOString().slice(0, 10),
        coverageEnd: coverageEnd.toISOString().slice(0, 10),
        coverageDays,
        daysInMonth: window.daysInMonth,
        proportion,
        rule: fullMonth
          ? "Vigente o mês inteiro: valor mensal equivalente integral."
          : "Vigência parcial: proporcional por dias civis do mês.",
        calculatedValue: Number(roundMoney(value))
      }
    };
  }

  if (billingKind === ContractPricingBillingKind.ON_DEMAND) {
    const value = quantity.mul(unitValue);
    return {
      calculatedValue: roundMoney(value),
      calculationMemory: {
        modality: "ON_DEMAND",
        description,
        quantity: Number(quantity),
        unitValue: Number(unitValue),
        rule: "Quantidade informada × valor unitário (saldo validado na composição/aprovação).",
        calculatedValue: Number(roundMoney(value))
      }
    };
  }

  // ONE_TIME: quantidade (ou fração) × valor unitário — pagamento integral (1) ou parcial.
  const value = quantity.mul(unitValue);
  return {
    calculatedValue: roundMoney(value),
    calculationMemory: {
      modality: "ONE_TIME",
      description,
      quantity: Number(quantity),
      unitValue: Number(unitValue),
      rule: "Pagamento único: quantidade/percentual informado × valor unitário.",
      calculatedValue: Number(roundMoney(value))
    }
  };
}

function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

/** Útil em testes/documentação: dia seguinte em UTC. */
export function nextUtcDay(d: Date): Date {
  return addUtcDays(d, 1);
}
