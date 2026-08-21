import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId, getAuditActorLabel, requestActorStore } from "../../common/audit-actor";
import { applyAuditDetailLevel, resolveAuditGate } from "../../common/audit-event-gate";
import {
  ContractAmendmentItemAction,
  ContractAmendmentStatus,
  ContractAmendmentType,
  ContractFeatureStatus,
  ContractGlpiTicketCategory,
  ContractItemChangeAction,
  ContractItemChangeType,
  ContractItemCriticality,
  ContractItemDeliveryStatus,
  ContractPricingBillingKind,
  ContractPricingItemStatus,
  ContractPricingPeriodicity,
  ContractControladoriaCaseStatus,
  ContractOccurrenceOrigin,
  ContractOccurrenceSeverity,
  ContractOccurrenceStatus,
  ContractOccurrenceType,
  ContractScheduleMilestoneStatus,
  ContractScheduleOrigin,
  ContractScheduleStatus,
  ContractScheduleType,
  ContractStatus,
  ContractType,
  LawType,
  Prisma
} from "@prisma/client";
import { compareItemCodes, sortFeaturesByItemCode } from "../../common/item-code-order";
import { PrismaService } from "../../prisma/prisma.service";
import {
  BulkUpdateFeatureValidationGroupDto,
  CancelContractAmendmentDto,
  CreateContractAmendmentDto,
  CreateContractDto,
  CreateContractFeatureDto,
  CreateContractModuleDto,
  CreateContractServiceDto,
  ChangeContractOccurrenceStatusDto,
  CreateContractOccurrenceDto,
  CreateContractScheduleDto,
  CreateContractValidationGroupDto,
  ContractGlpiGroupLinkDto,
  ContractScheduleMilestoneDto,
  ContractStructureImportRow,
  DeleteContractDto,
  ForwardOccurrenceToControladoriaDto,
  PricingItemDto,
  UpdateContractControladoriaCaseDto,
  UpdateContractDto,
  UpdateContractFeatureDto,
  UpdateContractModuleDto,
  UpdateContractOccurrenceDto,
  UpdateContractScheduleDto,
  UpdateContractServiceDto,
  UpdateContractValidationGroupDto
} from "./contracts.dto";
import {
  parseAssignmentFilter,
  resolveFeatureResponsibility,
  type AssignmentFilter
} from "./contract-responsibility";
import {
  addUtcDays,
  ContractPricingHelper,
  serializePricingItemSnapshot,
  startOfUtcDay,
  summarizePricingItemsAsOf,
  type PricingItemInput
} from "./contract-pricing.helper";
import {
  PricingItemsFinancialReportService,
  type PricingItemsFinancialReportQuery
} from "../reports/pricing-items-financial-report.service";
import {
  collectIdentificationIssues,
  isFormalDerivedFromInternal,
  parseInternalCode,
  type IdentificationIssue
} from "./contract-identification";
import { StorageService } from "../../storage/storage.service";

function moduleGroupKey(name: string): string {
  return name.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function dedupeGlpiGroupLinks(links: ContractGlpiGroupLinkDto[]): { glpiGroupId: number; glpiGroupName: string | null }[] {
  const seen = new Set<number>();
  const out: { glpiGroupId: number; glpiGroupName: string | null }[] = [];
  for (const l of links) {
    const id = l.glpiGroupId;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = l.glpiGroupName?.trim();
    out.push({ glpiGroupId: id, glpiGroupName: n ? n : null });
  }
  return out;
}

function serializeGlpiGroupsForAudit(
  groups: Array<{ glpiGroupId: number; glpiGroupName?: string | null }>
): Array<{ glpiGroupId: number; glpiGroupName: string | null }> {
  return groups
    .map((g) => ({
      glpiGroupId: g.glpiGroupId,
      glpiGroupName: g.glpiGroupName?.trim() ? g.glpiGroupName.trim() : null
    }))
    .sort((a, b) => a.glpiGroupId - b.glpiGroupId);
}

function glpiGroupsAuditPayload(
  previous: Array<{ glpiGroupId: number; glpiGroupName?: string | null }>,
  next: Array<{ glpiGroupId: number; glpiGroupName?: string | null }>
): {
  previousGroups: Array<{ glpiGroupId: number; glpiGroupName: string | null }>;
  newGroups: Array<{ glpiGroupId: number; glpiGroupName: string | null }>;
  added: Array<{ glpiGroupId: number; glpiGroupName: string | null }>;
  removed: Array<{ glpiGroupId: number; glpiGroupName: string | null }>;
} | null {
  const previousGroups = serializeGlpiGroupsForAudit(previous);
  const newGroups = serializeGlpiGroupsForAudit(next);
  if (JSON.stringify(previousGroups) === JSON.stringify(newGroups)) return null;
  const prevIds = new Set(previousGroups.map((g) => g.glpiGroupId));
  const nextIds = new Set(newGroups.map((g) => g.glpiGroupId));
  return {
    previousGroups,
    newGroups,
    added: newGroups.filter((g) => !prevIds.has(g.glpiGroupId)),
    removed: previousGroups.filter((g) => !nextIds.has(g.glpiGroupId))
  };
}

function isGlpiTicketClosedStatus(status: string | null | undefined): boolean {
  const s = (status || "").toLowerCase();
  return (
    s.includes("fechado") ||
    s.includes("solucionado") ||
    s.includes("resolvido") ||
    s.includes("closed") ||
    s.includes("solved") ||
    s === "5" ||
    s === "6"
  );
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Extrai prazo de resolução do JSON bruto do GLPI quando existir (campos variam por versão). */
function extractGlpiSlaDeadline(raw: unknown): string | null {
  const o = asJsonObject(raw);
  const candidates: unknown[] = [
    o.time_to_resolve,
    o.time_to_resolve_date,
    o.internal_time_to_resolve,
    o.sla_due_date,
    o.due_date,
    o.time_to_own
  ];
  for (const key of ["sla_ttr", "slas_id_ttr", "ola_ttr"] as const) {
    const nested = asJsonObject(o[key]);
    candidates.push(nested.date ?? nested.datetime ?? nested.due_date ?? nested.time_to_resolve);
  }
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() && !/^(0+|null|undefined)$/i.test(c.trim())) {
      const t = Date.parse(c.trim().replace(" ", "T"));
      if (Number.isFinite(t) && t > 0) return c.trim();
    }
  }
  return null;
}

/** Normaliza bound de data (YYYY-MM-DD) para comparação lexicográfica com `dateCreation` do cache. */
function normalizeDateBound(raw: string | undefined, kind: "start" | "end"): string | null {
  const v = (raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return kind === "start" ? `${v} 00:00:00` : `${v} 23:59:59`;
}

function featureDisplayName(itemCode: string | null | undefined, name: string): string {
  const code = itemCode?.trim();
  return code ? `${code} · ${name}` : name;
}

function sortModuleListFeatures<T extends { features: Array<{ itemCode?: string | null; name?: string }> }>(modules: T[]): T[] {
  return modules.map((module) => ({
    ...module,
    features: sortFeaturesByItemCode(module.features)
  }));
}

const LINKED_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  displayName: true,
  approvalStatus: true,
  role: true,
  organization: { select: { acronym: true } }
} as const;

type LinkedUserRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  approvalStatus: string;
  role: string;
  organization?: { acronym: string } | null;
};

export type ContractLinkedUser = {
  id: string;
  name: string;
  email: string;
  organizationAcronym: string | null;
  active: boolean;
  role: string;
};

function resolveUserDisplayName(user: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
}): string {
  const composed = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return user.displayName?.trim() || composed || user.email;
}

function serializeLinkedUser(user: LinkedUserRow): ContractLinkedUser {
  return {
    id: user.id,
    name: resolveUserDisplayName(user),
    email: user.email,
    organizationAcronym: user.organization?.acronym ?? null,
    active: user.approvalStatus === "APPROVED",
    role: user.role
  };
}

function normalizeUserIds(ids: string[] | undefined | null): string[] {
  return Array.from(new Set((ids ?? []).map((id) => id.trim()).filter(Boolean)));
}

const CRITICALITY_SCORE: Record<ContractItemCriticality, number> = {
  CRITICA: 5,
  ALTA: 4,
  MEDIA: 3,
  BAIXA: 2,
  APOIO: 1,
  NAO_SE_APLICA: 0
};

function criticalityScore(value: ContractItemCriticality | null | undefined): number {
  return CRITICALITY_SCORE[value ?? ContractItemCriticality.MEDIA] ?? CRITICALITY_SCORE.MEDIA;
}

function isMeasurableCriticality(value: ContractItemCriticality | null | undefined): boolean {
  return criticalityScore(value) > 0;
}

export type BillingPhase = "UNDEFINED" | "PRE_IMPLEMENTATION" | "IMPLEMENTATION" | "MONTHLY";

export type FeatureImplantationProportionDto = {
  applicable: boolean;
  /** Total físico de funcionalidades (inclui «Não se aplica»). */
  totalFeatures: number;
  /** Itens mensuráveis usados no percentual (exclui «Não se aplica»). */
  consideredInCalculation: number;
  /** Itens com criticidade «Não se aplica». */
  notApplicableCount: number;
  implantedCount: number;
  partialCount: number;
  notDeliveredCount: number;
  /** 0–1 ou null se não aplicável */
  ratioImplanted: number | null;
  /** Percentagem formatada para UI (pt-BR) ou null */
  ratioImplantedPercent: string | null;
  contractMonthlyValue: string;
  /** Valor mensal × ratio (entregues + 0,5×parciais) / total. */
  proportionalMonthlyValue: string | null;
  /** Valor de implantação contratual (referência), ou null se não definido. */
  contractInstallationValue: string | null;
  /** Valor de implantação × o mesmo ratio (itens implantados). */
  proportionalInstallationValue: string | null;
  /** Início do período de implantação (AAAA-MM-DD), se definido. */
  implementationPeriodStart: string | null;
  /** Fim do período de implantação (AAAA-MM-DD), se definido. */
  implementationPeriodEnd: string | null;
  /** Fase inferida pela data de referência e pelo período definido. */
  billingPhase: BillingPhase;
  /** Enfoque sugerido: implantação, mensalidade ou ambos (datas não configuradas). */
  billingEmphasis: "INSTALLATION" | "MONTHLY" | "BOTH";
  explanation: string | null;
};

function calendarKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveBillingPhase(at: Date, start: Date | null | undefined, end: Date | null | undefined): BillingPhase {
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "UNDEFINED";
  }
  const a = calendarKeyLocal(at);
  const s = calendarKeyLocal(start);
  const e = calendarKeyLocal(end);
  if (a < s) return "PRE_IMPLEMENTATION";
  if (a <= e) return "IMPLEMENTATION";
  return "MONTHLY";
}

function resolveBillingEmphasis(phase: BillingPhase): "INSTALLATION" | "MONTHLY" | "BOTH" {
  if (phase === "IMPLEMENTATION") return "INSTALLATION";
  if (phase === "MONTHLY") return "MONTHLY";
  return "BOTH";
}

function toIsoDateOnly(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

type ImplantationModulesInput = Array<{
  features: Array<{
    deliveryStatus: ContractItemDeliveryStatus;
    criticality?: ContractItemCriticality | null;
  }>;
}>;

/**
 * Indicadores de progresso de entrega: ratio comum aplicado à mensalidade e ao valor de implantação;
 * fase (pré / implantação / mensalidade) conforme datas do período de implantação.
 */
function buildFeatureImplantationProportionFromCounts(ctx: {
  monthlyValue: Prisma.Decimal;
  installationValue?: Prisma.Decimal | null;
  implementationPeriodStart?: Date | null;
  implementationPeriodEnd?: Date | null;
  totalFeatures: number;
  consideredInCalculation: number;
  notApplicableCount: number;
  implantedCount: number;
  partialCount: number;
  notDeliveredCount: number;
  at: Date;
}): FeatureImplantationProportionDto {
  return finishFeatureImplantationProportion(ctx);
}

function buildFeatureImplantationProportion(ctx: {
  monthlyValue: Prisma.Decimal;
  installationValue?: Prisma.Decimal | null;
  implementationPeriodStart?: Date | null;
  implementationPeriodEnd?: Date | null;
  modules: ImplantationModulesInput;
  at: Date;
}): FeatureImplantationProportionDto {
  let totalFeatures = 0;
  let consideredInCalculation = 0;
  let notApplicableCount = 0;
  let implantedCount = 0;
  let partialCount = 0;
  let notDeliveredCount = 0;
  for (const m of ctx.modules) {
    for (const f of m.features) {
      totalFeatures++;
      if (!isMeasurableCriticality(f.criticality)) {
        notApplicableCount++;
        continue;
      }
      consideredInCalculation++;
      if (f.deliveryStatus === ContractItemDeliveryStatus.DELIVERED) {
        implantedCount++;
      } else if (f.deliveryStatus === ContractItemDeliveryStatus.PARTIALLY_DELIVERED) {
        partialCount++;
      } else {
        notDeliveredCount++;
      }
    }
  }
  return finishFeatureImplantationProportion({
    monthlyValue: ctx.monthlyValue,
    installationValue: ctx.installationValue,
    implementationPeriodStart: ctx.implementationPeriodStart,
    implementationPeriodEnd: ctx.implementationPeriodEnd,
    totalFeatures,
    consideredInCalculation,
    notApplicableCount,
    implantedCount,
    partialCount,
    notDeliveredCount,
    at: ctx.at
  });
}

function finishFeatureImplantationProportion(ctx: {
  monthlyValue: Prisma.Decimal;
  installationValue?: Prisma.Decimal | null;
  implementationPeriodStart?: Date | null;
  implementationPeriodEnd?: Date | null;
  totalFeatures: number;
  consideredInCalculation: number;
  notApplicableCount: number;
  implantedCount: number;
  partialCount: number;
  notDeliveredCount: number;
  at: Date;
}): FeatureImplantationProportionDto {
  const {
    totalFeatures,
    consideredInCalculation,
    notApplicableCount,
    implantedCount,
    partialCount,
    notDeliveredCount
  } = ctx;
  const monthly = new Prisma.Decimal(ctx.monthlyValue);
  const contractMonthlyValue = monthly.toFixed(2);
  const instDec = ctx.installationValue != null ? new Prisma.Decimal(ctx.installationValue) : null;
  const contractInstallationValue = instDec != null ? instDec.toFixed(2) : null;
  const phase = resolveBillingPhase(ctx.at, ctx.implementationPeriodStart, ctx.implementationPeriodEnd);
  const billingEmphasis = resolveBillingEmphasis(phase);
  const implementationPeriodStart = toIsoDateOnly(ctx.implementationPeriodStart ?? null);
  const implementationPeriodEnd = toIsoDateOnly(ctx.implementationPeriodEnd ?? null);

  if (totalFeatures === 0) {
    return {
      applicable: false,
      totalFeatures: 0,
      consideredInCalculation: 0,
      notApplicableCount: 0,
      implantedCount: 0,
      partialCount: 0,
      notDeliveredCount: 0,
      ratioImplanted: null,
      ratioImplantedPercent: null,
      contractMonthlyValue,
      proportionalMonthlyValue: null,
      contractInstallationValue,
      proportionalInstallationValue: null,
      implementationPeriodStart,
      implementationPeriodEnd,
      billingPhase: phase,
      billingEmphasis,
      explanation:
        "Não existem funcionalidades em módulos; não é possível calcular valores proporcionais ao progresso de entrega."
    };
  }
  if (consideredInCalculation === 0) {
    return {
      applicable: false,
      totalFeatures,
      consideredInCalculation: 0,
      notApplicableCount,
      implantedCount: 0,
      partialCount: 0,
      notDeliveredCount: 0,
      ratioImplanted: null,
      ratioImplantedPercent: null,
      contractMonthlyValue,
      proportionalMonthlyValue: null,
      contractInstallationValue,
      proportionalInstallationValue: null,
      implementationPeriodStart,
      implementationPeriodEnd,
      billingPhase: phase,
      billingEmphasis,
      explanation:
        notApplicableCount > 0
          ? `${totalFeatures} ${totalFeatures === 1 ? "item" : "itens"} · 0 considerados no cálculo · ${notApplicableCount} não se aplicam. Sem itens mensuráveis, o percentual de cumprimento não se aplica.`
          : "Não há itens mensuráveis para calcular o percentual de cumprimento."
    };
  }
  const half = new Prisma.Decimal("0.5");
  const weightedDelivered = new Prisma.Decimal(implantedCount).plus(new Prisma.Decimal(partialCount).mul(half));
  const ratioDec = weightedDelivered.div(new Prisma.Decimal(consideredInCalculation));
  const proportionalMonthly = monthly.mul(ratioDec).toDecimalPlaces(2);
  const proportionalInstallation =
    instDec != null ? instDec.mul(ratioDec).toDecimalPlaces(2) : null;
  const ratioNum = Number(ratioDec.toString());
  return {
    applicable: true,
    totalFeatures,
    consideredInCalculation,
    notApplicableCount,
    implantedCount,
    partialCount,
    notDeliveredCount,
    ratioImplanted: Number.isFinite(ratioNum) ? ratioNum : null,
    ratioImplantedPercent: Number.isFinite(ratioNum)
      ? (ratioNum * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 1 })
      : null,
    contractMonthlyValue,
    proportionalMonthlyValue: proportionalMonthly.toFixed(2),
    contractInstallationValue,
    proportionalInstallationValue: proportionalInstallation != null ? proportionalInstallation.toFixed(2) : null,
    implementationPeriodStart,
    implementationPeriodEnd,
    billingPhase: phase,
    billingEmphasis,
    explanation: null
  };
}

function assertImplementationPeriodOrder(start: Date | null, end: Date | null): void {
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end.getTime() < start.getTime()) {
    throw new BadRequestException("A data de fim do período de implantação não pode ser anterior à data de início.");
  }
}

async function allocateInternalCode(
  tx: Prisma.TransactionClient,
  contractTypeCatalogId: string,
  year: number
): Promise<string> {
  const catalog = await tx.contractTypeCatalog.findUnique({ where: { id: contractTypeCatalogId } });
  if (!catalog) throw new BadRequestException("Tipo de contrato do catálogo não encontrado.");
  const existing = await tx.contractInternalCodeSequence.findUnique({
    where: { contractTypeCatalogId_year: { contractTypeCatalogId, year } }
  });
  let nextSeq: number;
  if (existing) {
    nextSeq = existing.lastSequential + 1;
    await tx.contractInternalCodeSequence.update({
      where: { id: existing.id },
      data: { lastSequential: nextSeq }
    });
  } else {
    nextSeq = 1;
    await tx.contractInternalCodeSequence.create({
      data: { contractTypeCatalogId, year, lastSequential: nextSeq }
    });
  }
  const acronym = catalog.acronym.trim().toUpperCase();
  return `${acronym}-${year}-${String(nextSeq).padStart(3, "0")}`;
}

@Injectable()
export class ContractsService {
  private readonly pricing: ContractPricingHelper;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {
    this.pricing = new ContractPricingHelper(prisma);
  }

  async listPricingItemsFinancialReport(query?: PricingItemsFinancialReportQuery) {
    return new PricingItemsFinancialReportService(this.prisma).list(query);
  }

  async create(dto: CreateContractDto): Promise<unknown> {
    const {
      glpiGroups,
      pricingItems,
      globalValueManual = false,
      globalValueCurrent: requestedGlobalValueCurrent,
      globalValueJustification: requestedGlobalValueJustification,
      ...rest
    } = dto;
    let monthlyValue = rest.monthlyValue ?? 0;
    let installationValue =
      rest.installationValue === undefined || rest.installationValue === null
        ? null
        : rest.installationValue;
    let totalValue = rest.totalValue ?? monthlyValue * 12;
    let globalValueOriginal: number | null = null;
    let globalValueCurrent: number | null = null;

    if (pricingItems && pricingItems.length > 0) {
      const { summarizePricingItems } = await import("./contract-pricing.helper");
      const helperTotals = summarizePricingItems(
        pricingItems.map((p) => {
          const qty = Number(p.quantity);
          const uv = Number(p.unitValue);
          const totalManual = Boolean(p.totalManual);
          const expected = Math.round(qty * uv * 100) / 100;
          const total = totalManual && p.totalValue != null ? Number(p.totalValue) : expected;
          return {
            quantity: qty,
            unitValue: uv,
            totalValue: total,
            billingKind: p.billingKind as never,
            periodicity: (p.periodicity ?? null) as never,
            status: (p.status ?? "ACTIVE") as never
          };
        })
      );
      monthlyValue = helperTotals.monthlyValue;
      installationValue = helperTotals.installationValue;
      totalValue = helperTotals.globalEstimated || monthlyValue * 12;
      globalValueOriginal = helperTotals.globalEstimated;
      globalValueCurrent = helperTotals.globalEstimated;
    }

    const globalValueJustification = (requestedGlobalValueJustification ?? "").trim();
    if (globalValueManual) {
      if (!globalValueJustification) {
        throw new BadRequestException("Informe a justificativa para o ajuste manual do valor global.");
      }
      if (requestedGlobalValueCurrent == null || requestedGlobalValueCurrent < 0) {
        throw new BadRequestException("Informe um valor global manual válido.");
      }
      globalValueCurrent = requestedGlobalValueCurrent;
    }

    if (!(monthlyValue > 0) && !(pricingItems && pricingItems.length > 0)) {
      throw new BadRequestException("Informe a mensalidade ou ao menos um item contratual.");
    }
    if (!(monthlyValue > 0)) {
      monthlyValue = 0.01;
    }

    const startDate = new Date(rest.startDate);
    const contractYear = startDate.getFullYear();
    const formalNumber = rest.formalNumber?.trim() || null;
    const contractNumber = formalNumber ? `${formalNumber}/${contractYear}` : rest.number?.trim();
    if (!contractNumber) {
      throw new BadRequestException("Informe o número do contrato ou o número formal.");
    }
    await this.assertFormalNumberAvailable(formalNumber, contractYear);

    let contractType = rest.contractType;
    if (rest.contractTypeCatalogId) {
      const catalog = await this.prisma.contractTypeCatalog.findUnique({
        where: { id: rest.contractTypeCatalogId }
      });
      if (!catalog) throw new BadRequestException("Tipo de contrato do catálogo não encontrado.");
      if (catalog.legacyEnum) contractType = catalog.legacyEnum;
    }
    if (!contractType) {
      throw new BadRequestException("Informe o tipo de contrato ou selecione um tipo do catálogo.");
    }

    const managerId = rest.managerId ?? rest.fiscalId;
    const implStart = rest.implementationPeriodStart ? new Date(rest.implementationPeriodStart) : null;
    const implEnd = rest.implementationPeriodEnd ? new Date(rest.implementationPeriodEnd) : null;
    assertImplementationPeriodOrder(implStart, implEnd);

    const created = await this.prisma.$transaction(async (tx) => {
      let internalCode: string | null = null;
      if (rest.contractTypeCatalogId) {
        internalCode = await allocateInternalCode(tx, rest.contractTypeCatalogId, contractYear);
      }
      return tx.contract.create({
        data: {
          number: contractNumber,
          formalNumber,
          contractYear,
          internalCode,
          administrativeProcess: rest.administrativeProcess?.trim() || null,
          organizationId: rest.organizationId ?? null,
          contractTypeCatalogId: rest.contractTypeCatalogId ?? null,
          hiringTypeId: rest.hiringTypeId ?? null,
          hiringProcedureNumber: rest.hiringProcedureNumber?.trim() || null,
          name: rest.name,
          description: rest.description,
          managingUnit: rest.managingUnit,
          companyName: rest.companyName,
          cnpj: rest.cnpj,
          contractType,
          lawType: rest.lawType ?? LawType.LEI_14133,
          startDate,
          endDate: new Date(rest.endDate),
          totalValue: new Prisma.Decimal(totalValue),
          monthlyValue: new Prisma.Decimal(monthlyValue),
          installationValue: installationValue === null ? null : new Prisma.Decimal(installationValue),
          globalValueOriginal:
            globalValueOriginal != null ? new Prisma.Decimal(globalValueOriginal) : new Prisma.Decimal(totalValue),
          globalValueCurrent:
            globalValueCurrent != null ? new Prisma.Decimal(globalValueCurrent) : new Prisma.Decimal(totalValue),
          globalValueManual,
          globalValueJustification: globalValueManual ? globalValueJustification : null,
          implementationPeriodStart: implStart,
          implementationPeriodEnd: implEnd,
          status: rest.status ?? ContractStatus.ACTIVE,
          slaTarget: rest.slaTarget != null ? new Prisma.Decimal(rest.slaTarget) : null,
          fiscalId: rest.fiscalId,
          managerId,
          supplierId: rest.supplierId ?? null,
          glpiGroups:
            glpiGroups != null && glpiGroups.length > 0 ? { create: dedupeGlpiGroupLinks(glpiGroups) } : undefined
        }
      });
    });
    await this.createAudit("Contract", created.id, "CREATE", null, created);
    const createdGlpiLinks = glpiGroups != null ? dedupeGlpiGroupLinks(glpiGroups) : [];
    const createGlpiAudit = glpiGroupsAuditPayload([], createdGlpiLinks);
    if (createGlpiAudit) {
      await this.createAudit(
        "ContractGlpiGroup",
        created.id,
        "UPDATE",
        { previousGroups: createGlpiAudit.previousGroups, removed: createGlpiAudit.removed },
        { newGroups: createGlpiAudit.newGroups, added: createGlpiAudit.added }
      );
    }
    if (pricingItems && pricingItems.length > 0) {
      await this.pricing.replaceItems(created.id, pricingItems as PricingItemInput[], (action, oldData, newData) =>
        this.createAudit("ContractPricingItem", created.id, action, oldData, newData)
      );
    }
    return this.findOne(created.id);
  }

  /** Grupos distintos já vistos nos chamados sincronizados (`Ticket.contractGroupId`). */
  async findDistinctGlpiAssignedGroupOptions(): Promise<{ glpiGroupId: number; glpiGroupName: string | null }[]> {
    const rows = await this.prisma.ticket.findMany({
      where: { contractGroupId: { not: null } },
      distinct: ["contractGroupId"],
      select: { contractGroupId: true, contractGroupName: true },
      orderBy: [{ contractGroupName: "asc" }, { contractGroupId: "asc" }]
    });
    return rows
      .filter((r): r is { contractGroupId: number; contractGroupName: string | null } => r.contractGroupId != null)
      .map((r) => ({ glpiGroupId: r.contractGroupId, glpiGroupName: r.contractGroupName ?? null }));
  }

  /**
   * Chamados GLPI em cache cujos grupos técnicos coincidem com os vínculos do contrato.
   * Somente leitura do cache local — não consulta nem altera o GLPI.
   */
  async listContractGlpiTickets(
    contractId: string,
    query?: {
      status?: string;
      priority?: string;
      from?: string;
      to?: string;
      slaOverdue?: boolean;
      take?: number;
    }
  ): Promise<{
    contractId: string;
    glpiGroupIds: number[];
    glpiGroups: Array<{ glpiGroupId: number; glpiGroupName: string | null }>;
    tickets: Array<{
      glpiTicketId: number;
      title: string | null;
      status: string | null;
      priority: string | null;
      dateCreation: string | null;
      dateModification: string | null;
      contractGroupId: number | null;
      contractGroupName: string | null;
      requesterName: string | null;
      assignedUserName: string | null;
      waitingParty: string | null;
      slaDeadline: string | null;
      slaOverdue: boolean | null;
      updatedAt: string;
      localClassification: {
        category: ContractGlpiTicketCategory;
        notes: string | null;
      } | null;
    }>;
    total: number;
    facets: {
      statuses: string[];
      priorities: string[];
      slaOverdueAvailable: boolean;
    };
  }> {
    const accessible = await this.accessibleContractWhere(contractId);
    const contract = await this.prisma.contract.findFirst({
      where: accessible,
      select: {
        id: true,
        glpiGroups: {
          select: { glpiGroupId: true, glpiGroupName: true },
          orderBy: { glpiGroupName: "asc" }
        }
      }
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado");

    const glpiGroupIds = contract.glpiGroups.map((g) => g.glpiGroupId);
    const empty = {
      contractId: contract.id,
      glpiGroupIds,
      glpiGroups: contract.glpiGroups,
      tickets: [] as Array<{
        glpiTicketId: number;
        title: string | null;
        status: string | null;
        priority: string | null;
        dateCreation: string | null;
        dateModification: string | null;
        contractGroupId: number | null;
        contractGroupName: string | null;
        requesterName: string | null;
        assignedUserName: string | null;
        waitingParty: string | null;
        slaDeadline: string | null;
        slaOverdue: boolean | null;
        updatedAt: string;
        localClassification: {
          category: ContractGlpiTicketCategory;
          notes: string | null;
        } | null;
      }>,
      total: 0,
      facets: { statuses: [] as string[], priorities: [] as string[], slaOverdueAvailable: false }
    };
    if (glpiGroupIds.length === 0) {
      return empty;
    }

    const takeRaw = query?.take != null ? Math.trunc(Number(query.take)) : 200;
    const take = Number.isFinite(takeRaw) ? Math.min(500, Math.max(1, takeRaw)) : 200;
    const statusFilter = (query?.status ?? "").trim();
    const priorityFilter = (query?.priority ?? "").trim();
    const from = normalizeDateBound(query?.from, "start");
    const to = normalizeDateBound(query?.to, "end");
    const slaOverdueOnly = query?.slaOverdue === true;

    const baseWhere: Prisma.TicketWhereInput = {
      contractGroupId: { in: glpiGroupIds }
    };

    const [statusRows, priorityRows, slaSample] = await Promise.all([
      this.prisma.ticket.findMany({
        where: baseWhere,
        distinct: ["status"],
        select: { status: true }
      }),
      this.prisma.ticket.findMany({
        where: baseWhere,
        distinct: ["priority"],
        select: { priority: true }
      }),
      this.prisma.ticket.findMany({
        where: baseWhere,
        select: { rawJson: true },
        take: 80,
        orderBy: { updatedAt: "desc" }
      })
    ]);
    const statuses = statusRows
      .map((r) => r.status?.trim())
      .filter((s): s is string => Boolean(s))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const priorities = priorityRows
      .map((r) => r.priority?.trim())
      .filter((s): s is string => Boolean(s))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const slaOverdueAvailable = slaSample.some((row) => Boolean(extractGlpiSlaDeadline(row.rawJson)));

    const where: Prisma.TicketWhereInput = {
      ...baseWhere,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
      ...(from || to
        ? {
            dateCreation: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {})
            }
          }
        : {})
    };

    const rows = await this.prisma.ticket.findMany({
      where,
      orderBy: [{ dateCreation: "desc" }, { glpiTicketId: "desc" }],
      take: slaOverdueOnly ? Math.min(2000, take * 5) : take,
      select: {
        glpiTicketId: true,
        title: true,
        status: true,
        priority: true,
        dateCreation: true,
        dateModification: true,
        contractGroupId: true,
        contractGroupName: true,
        requesterName: true,
        assignedUserName: true,
        waitingParty: true,
        rawJson: true,
        updatedAt: true
      }
    });

    const ticketIds = rows.map((r) => r.glpiTicketId);
    const classRows =
      ticketIds.length > 0
        ? await this.prisma.contractGlpiTicketClass.findMany({
            where: { contractId: contract.id, glpiTicketId: { in: ticketIds } },
            select: { glpiTicketId: true, category: true, notes: true }
          })
        : [];
    const classByTicket = new Map(classRows.map((c) => [c.glpiTicketId, c]));

    const now = Date.now();
    let mapped = rows.map((row) => {
      const slaDeadline = extractGlpiSlaDeadline(row.rawJson);
      const closed = isGlpiTicketClosedStatus(row.status);
      let slaOverdue: boolean | null = null;
      if (slaDeadline) {
        const t = Date.parse(slaDeadline.replace(" ", "T"));
        if (Number.isFinite(t)) {
          slaOverdue = !closed && t < now;
        }
      }
      const local = classByTicket.get(row.glpiTicketId);
      return {
        glpiTicketId: row.glpiTicketId,
        title: row.title,
        status: row.status,
        priority: row.priority,
        dateCreation: row.dateCreation,
        dateModification: row.dateModification,
        contractGroupId: row.contractGroupId,
        contractGroupName: row.contractGroupName,
        requesterName: row.requesterName,
        assignedUserName: row.assignedUserName,
        waitingParty: row.waitingParty,
        slaDeadline,
        slaOverdue,
        updatedAt: row.updatedAt.toISOString(),
        localClassification: local
          ? { category: local.category, notes: local.notes }
          : null
      };
    });

    if (slaOverdueOnly) {
      mapped = mapped.filter((t) => t.slaOverdue === true).slice(0, take);
    }

    return {
      contractId: contract.id,
      glpiGroupIds,
      glpiGroups: contract.glpiGroups,
      tickets: mapped,
      total: mapped.length,
      facets: {
        statuses,
        priorities,
        slaOverdueAvailable
      }
    };
  }

  async upsertContractGlpiTicketClass(
    contractId: string,
    glpiTicketId: number,
    body: { category?: string; notes?: string | null }
  ): Promise<{
    contractId: string;
    glpiTicketId: number;
    category: ContractGlpiTicketCategory;
    notes: string | null;
  }> {
    await this.ensureContract(contractId);
    if (!Number.isFinite(glpiTicketId) || glpiTicketId <= 0) {
      throw new BadRequestException("Identificador do chamado GLPI inválido.");
    }
    const allowed = Object.values(ContractGlpiTicketCategory);
    const rawCat = String(body.category ?? "OUTRO").trim().toUpperCase();
    if (!allowed.includes(rawCat as ContractGlpiTicketCategory)) {
      throw new BadRequestException(
        `Categoria inválida. Use: ${allowed.join(", ")}.`
      );
    }
    const category = rawCat as ContractGlpiTicketCategory;
    const notes =
      body.notes === undefined || body.notes === null
        ? null
        : String(body.notes).trim() || null;

    const row = await this.prisma.contractGlpiTicketClass.upsert({
      where: {
        contractId_glpiTicketId: { contractId, glpiTicketId }
      },
      create: { contractId, glpiTicketId, category, notes },
      update: { category, notes }
    });
    await this.createAudit("ContractGlpiTicketClass", row.id, "UPDATE", null, {
      contractId,
      glpiTicketId,
      category,
      notes
    });
    return {
      contractId,
      glpiTicketId: row.glpiTicketId,
      category: row.category,
      notes: row.notes
    };
  }

  async findModuleValidators(): Promise<
    Array<{
      id: string;
      name: string;
      email: string;
      organizationAcronym: string | null;
      active: boolean;
      role: string;
    }>
  > {
    const rows = await this.prisma.user.findMany({
      where: { approvalStatus: "APPROVED" },
      orderBy: [{ displayName: "asc" }, { email: "asc" }],
      select: LINKED_USER_SELECT
    });
    return rows.map(serializeLinkedUser);
  }

  /**
   * Resumo dos contratos com estrutura modular (sem carregar funcionalidades).
   * Totais de entrega vêm de agregação no banco.
   * Escopo: órgão do usuário + contratos de outros órgãos onde há atribuição (ticket 56).
   */
  async findModulesDeliveryOverview(query?: { assignment?: string }): Promise<unknown> {
    const assignment = parseAssignmentFilter(query?.assignment);
    const actorId = requestActorStore.getStore()?.userId ?? null;
    const contractWhere = await this.modulesDeliveryContractWhere();
    const rows = await this.prisma.contract.findMany({
      where: contractWhere,
      select: {
        id: true,
        number: true,
        name: true,
        contractType: true,
        status: true,
        monthlyValue: true,
        installationValue: true,
        implementationPeriodStart: true,
        implementationPeriodEnd: true,
        fiscal: { select: { id: true, name: true, email: true } },
        manager: { select: { id: true, name: true, email: true } },
        _count: { select: { modules: true } }
      },
      orderBy: { number: "asc" }
    });
    if (rows.length === 0) return [];

    let contractIds = rows.map((r) => r.id);
    if (assignment !== "ALL" && actorId) {
      contractIds = await this.filterContractIdsByAssignment(contractIds, assignment, actorId);
      if (contractIds.length === 0) return [];
    }

    const modules = await this.prisma.contractModule.findMany({
      where: { contractId: { in: contractIds } },
      select: { id: true, contractId: true }
    });
    const moduleIds = modules.map((m) => m.id);
    const moduleToContract = new Map(modules.map((m) => [m.id, m.contractId]));

    const featureWhereExtra =
      assignment !== "ALL" && actorId ? this.featureAssignmentWhere(assignment, actorId) : {};

    const grouped =
      moduleIds.length === 0
        ? []
        : await this.prisma.contractFeature.groupBy({
            by: ["moduleId", "deliveryStatus", "criticality"],
            where: { moduleId: { in: moduleIds }, ...featureWhereExtra },
            _count: { _all: true }
          });

    const countsByContract = new Map<
      string,
      {
        total: number;
        considered: number;
        notApplicable: number;
        delivered: number;
        partial: number;
        notDelivered: number;
      }
    >();
    for (const id of contractIds) {
      countsByContract.set(id, {
        total: 0,
        considered: 0,
        notApplicable: 0,
        delivered: 0,
        partial: 0,
        notDelivered: 0
      });
    }
    for (const g of grouped) {
      const contractId = moduleToContract.get(g.moduleId);
      if (!contractId) continue;
      const bucket = countsByContract.get(contractId);
      if (!bucket) continue;
      const n = g._count._all;
      bucket.total += n;
      if (!isMeasurableCriticality(g.criticality)) {
        bucket.notApplicable += n;
        continue;
      }
      bucket.considered += n;
      if (g.deliveryStatus === ContractItemDeliveryStatus.DELIVERED) bucket.delivered += n;
      else if (g.deliveryStatus === ContractItemDeliveryStatus.PARTIALLY_DELIVERED) bucket.partial += n;
      else bucket.notDelivered += n;
    }

    const filteredRows = rows.filter((r) => contractIds.includes(r.id));
    return filteredRows.map((row) => {
      const c = countsByContract.get(row.id) ?? {
        total: 0,
        considered: 0,
        notApplicable: 0,
        delivered: 0,
        partial: 0,
        notDelivered: 0
      };
      return {
        id: row.id,
        number: row.number,
        name: row.name,
        contractType: row.contractType,
        status: row.status,
        monthlyValue: row.monthlyValue,
        fiscal: row.fiscal,
        manager: row.manager,
        modulesCount: row._count.modules,
        totals: {
          totalFeatures: c.total,
          consideredInCalculation: c.considered,
          notApplicableCount: c.notApplicable,
          deliveredCount: c.delivered,
          partialCount: c.partial,
          notDeliveredCount: c.notDelivered
        },
        featureImplantationProportion: buildFeatureImplantationProportionFromCounts({
          monthlyValue: row.monthlyValue,
          installationValue: row.installationValue ?? null,
          implementationPeriodStart: row.implementationPeriodStart ?? null,
          implementationPeriodEnd: row.implementationPeriodEnd ?? null,
          totalFeatures: c.total,
          consideredInCalculation: c.considered,
          notApplicableCount: c.notApplicable,
          implantedCount: c.delivered,
          partialCount: c.partial,
          notDeliveredCount: c.notDelivered,
          at: new Date()
        })
      };
    });
  }

  /** Módulos de um contrato com totais por status (sem funcionalidades). */
  async findContractModulesDelivery(contractId: string): Promise<unknown> {
    await this.ensureContract(contractId);
    const modulesRaw = await this.prisma.contractModule.findMany({
      where: { contractId },
      select: {
        id: true,
        name: true,
        criticality: true,
        validatorId: true,
        validator: { select: LINKED_USER_SELECT },
        fiscals: {
          include: { user: { select: LINKED_USER_SELECT } },
          orderBy: { createdAt: "asc" }
        },
        glosaPricingItemId: true,
        glosaPricingItem: { select: { id: true, sequence: true, description: true } },
        weight: true
      },
      orderBy: { name: "asc" }
    });
    const modules = modulesRaw.map((mod) => {
      const fiscalUsers = this.resolveModuleFiscalUsers(mod);
      const { fiscals: _fiscals, ...rest } = mod;
      return {
        ...rest,
        validator: mod.validator
          ? { id: mod.validator.id, email: mod.validator.email, role: mod.validator.role }
          : null,
        fiscalUsers,
        fiscalUserIds: fiscalUsers.map((u) => u.id)
      };
    });
    if (modules.length === 0) return { contractId, modules: [] };

    const moduleIds = modules.map((m) => m.id);
    const grouped = await this.prisma.contractFeature.groupBy({
      by: ["moduleId", "deliveryStatus", "criticality"],
      where: { moduleId: { in: moduleIds } },
      _count: { _all: true }
    });
    const byModule = new Map<
      string,
      {
        total: number;
        considered: number;
        notApplicable: number;
        delivered: number;
        partial: number;
        notDelivered: number;
      }
    >();
    for (const id of moduleIds) {
      byModule.set(id, {
        total: 0,
        considered: 0,
        notApplicable: 0,
        delivered: 0,
        partial: 0,
        notDelivered: 0
      });
    }
    for (const g of grouped) {
      const bucket = byModule.get(g.moduleId);
      if (!bucket) continue;
      const n = g._count._all;
      bucket.total += n;
      if (!isMeasurableCriticality(g.criticality)) {
        bucket.notApplicable += n;
        continue;
      }
      bucket.considered += n;
      if (g.deliveryStatus === ContractItemDeliveryStatus.DELIVERED) bucket.delivered += n;
      else if (g.deliveryStatus === ContractItemDeliveryStatus.PARTIALLY_DELIVERED) bucket.partial += n;
      else bucket.notDelivered += n;
    }

    return {
      contractId,
      modules: modules.map((m) => {
        const t = byModule.get(m.id)!;
        return {
          ...m,
          totals: {
            totalFeatures: t.total,
            consideredInCalculation: t.considered,
            notApplicableCount: t.notApplicable,
            deliveredCount: t.delivered,
            partialCount: t.partial,
            notDeliveredCount: t.notDelivered
          }
        };
      })
    };
  }

  /** Funcionalidades de um módulo, com paginação e filtros opcionais. */
  async findModuleFeaturesDelivery(
    contractId: string,
    moduleId: string,
    query: {
      page?: number;
      pageSize?: number;
      q?: string;
      deliveryStatus?: string;
      criticality?: string;
      assignment?: string;
    }
  ): Promise<unknown> {
    await this.ensureModule(contractId, moduleId);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 40));
    const assignment = parseAssignmentFilter(query.assignment);
    const actorId = requestActorStore.getStore()?.userId ?? null;
    const where: Prisma.ContractFeatureWhereInput = {
      ...this.buildFeatureDeliveryWhere(moduleId, query),
      ...(assignment !== "ALL" && actorId ? this.featureAssignmentWhere(assignment, actorId) : {})
    };

    const [total, features] = await Promise.all([
      this.prisma.contractFeature.count({ where }),
      this.prisma.contractFeature.findMany({
        where,
        select: {
          id: true,
          itemCode: true,
          name: true,
          weight: true,
          status: true,
          criticality: true,
          deliveryStatus: true,
          validationGroupId: true,
          validationGroup: {
            select: {
              id: true,
              name: true,
              active: true,
              members: {
                include: { user: { select: LINKED_USER_SELECT } },
                orderBy: { createdAt: "asc" }
              }
            }
          },
          responsibles: {
            include: { user: { select: LINKED_USER_SELECT } },
            orderBy: { createdAt: "asc" }
          }
        },
        orderBy: [{ itemCode: "asc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    const moduleFiscals = await this.prisma.contractModule.findFirst({
      where: { id: moduleId, contractId },
      select: {
        validatorId: true,
        validator: { select: LINKED_USER_SELECT },
        fiscals: {
          include: { user: { select: LINKED_USER_SELECT } },
          orderBy: { createdAt: "asc" }
        }
      }
    });
    const moduleFiscalUsers = moduleFiscals ? this.resolveModuleFiscalUsers(moduleFiscals) : [];
    const moduleFiscalUserIds = new Set(moduleFiscalUsers.map((u) => u.id));

    const ordered = sortFeaturesByItemCode(
      features.map((feat) => {
        const responsibleUsers = (feat.responsibles ?? []).map((r) => serializeLinkedUser(r.user));
        const groupMembers = (feat.validationGroup?.members ?? []).map((m) => serializeLinkedUser(m.user));
        const responsibility = resolveFeatureResponsibility({
          validationGroupId: feat.validationGroupId,
          validationGroup: feat.validationGroup
            ? {
                id: feat.validationGroup.id,
                name: feat.validationGroup.name,
                active: feat.validationGroup.active,
                members: groupMembers
              }
            : null,
          responsibleUsers
        });
        const reasons: Array<"GROUP" | "FEATURE" | "MODULE" | "UNDEFINED_GROUP" | "NONE"> = [
          ...responsibility.assignmentReasons
        ];
        if (actorId && moduleFiscalUserIds.has(actorId)) {
          reasons.push("MODULE");
        }
        const { responsibles: _r, validationGroup: _vg, ...rest } = feat;
        return {
          ...rest,
          ...responsibility,
          assignmentReasons: reasons,
          isModuleFiscalForActor: Boolean(actorId && moduleFiscalUserIds.has(actorId))
        };
      })
    );
    return {
      contractId,
      moduleId,
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
      features: ordered
    };
  }

  /**
   * Pesquisa/filtros sobre todas as funcionalidades (não só as já carregadas na UI).
   * Retorna contratos e módulos compatíveis com os filtros, com a 1.ª página de itens por módulo.
   */
  async searchModulesDeliveryFeatures(query: {
    q?: string;
    deliveryStatus?: string;
    criticality?: string;
    assignment?: string;
    pageSize?: number;
  }): Promise<unknown> {
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 40));
    const q = (query.q ?? "").trim();
    const deliveryStatus = query.deliveryStatus?.trim() || undefined;
    const criticality = query.criticality?.trim() || undefined;
    const assignment = parseAssignmentFilter(query.assignment);
    const actorId = requestActorStore.getStore()?.userId ?? null;
    if (!q && !deliveryStatus && !criticality && assignment === "ALL") {
      return { contracts: [], totalFeatures: 0 };
    }

    const contractWhere = await this.modulesDeliveryContractWhere();
    const featureWhere: Prisma.ContractFeatureWhereInput = {
      module: { contract: contractWhere },
      ...(assignment !== "ALL" && actorId ? this.featureAssignmentWhere(assignment, actorId) : {})
    };
    if (deliveryStatus && Object.values(ContractItemDeliveryStatus).includes(deliveryStatus as ContractItemDeliveryStatus)) {
      featureWhere.deliveryStatus = deliveryStatus as ContractItemDeliveryStatus;
    }
    if (criticality && Object.values(ContractItemCriticality).includes(criticality as ContractItemCriticality)) {
      featureWhere.criticality = criticality as ContractItemCriticality;
    }
    if (q) {
      featureWhere.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { itemCode: { contains: q, mode: "insensitive" } }
      ];
    }

    const matching = await this.prisma.contractFeature.findMany({
      where: featureWhere,
      select: {
        id: true,
        itemCode: true,
        name: true,
        weight: true,
        status: true,
        criticality: true,
        deliveryStatus: true,
        moduleId: true,
        module: {
          select: {
            id: true,
            name: true,
            weight: true,
            criticality: true,
            contractId: true,
            contract: {
              select: {
                id: true,
                number: true,
                name: true,
                contractType: true,
                status: true,
                monthlyValue: true,
                fiscal: { select: { id: true, name: true, email: true } },
                manager: { select: { id: true, name: true, email: true } }
              }
            }
          }
        }
      },
      orderBy: [{ itemCode: "asc" }, { name: "asc" }],
      take: 500
    });

    type ModBucket = {
      id: string;
      name: string;
      weight: unknown;
      criticality: ContractItemCriticality;
      features: typeof matching;
    };
    const byContract = new Map<
      string,
      {
        contract: (typeof matching)[number]["module"]["contract"];
        modules: Map<string, ModBucket>;
      }
    >();

    for (const f of matching) {
      const c = f.module.contract;
      let entry = byContract.get(c.id);
      if (!entry) {
        entry = { contract: c, modules: new Map() };
        byContract.set(c.id, entry);
      }
      let mod = entry.modules.get(f.moduleId);
      if (!mod) {
        mod = {
          id: f.module.id,
          name: f.module.name,
          weight: f.module.weight,
          criticality: f.module.criticality,
          features: []
        };
        entry.modules.set(f.moduleId, mod);
      }
      mod.features.push(f);
    }

    const contracts = [...byContract.values()]
      .sort((a, b) => a.contract.number.localeCompare(b.contract.number, "pt-BR"))
      .map(({ contract, modules }) => {
        const modList = [...modules.values()].map((m) => {
          const delivered = m.features.filter((f) => f.deliveryStatus === "DELIVERED").length;
          const partial = m.features.filter((f) => f.deliveryStatus === "PARTIALLY_DELIVERED").length;
          const notDelivered = m.features.length - delivered - partial;
          const page = sortFeaturesByItemCode(m.features).slice(0, pageSize);
          return {
            id: m.id,
            name: m.name,
            weight: m.weight,
            criticality: m.criticality,
            totals: {
              totalFeatures: m.features.length,
              deliveredCount: delivered,
              partialCount: partial,
              notDeliveredCount: notDelivered
            },
            featuresPage: {
              page: 1,
              pageSize,
              total: m.features.length,
              hasMore: m.features.length > pageSize,
              features: page.map(({ module: _m, moduleId: _mid, ...rest }) => rest)
            }
          };
        });
        const totalFeatures = modList.reduce((s, m) => s + m.totals.totalFeatures, 0);
        const deliveredCount = modList.reduce((s, m) => s + m.totals.deliveredCount, 0);
        const partialCount = modList.reduce((s, m) => s + m.totals.partialCount, 0);
        const notDeliveredCount = modList.reduce((s, m) => s + m.totals.notDeliveredCount, 0);
        return {
          id: contract.id,
          number: contract.number,
          name: contract.name,
          contractType: contract.contractType,
          status: contract.status,
          monthlyValue: contract.monthlyValue,
          fiscal: contract.fiscal,
          manager: contract.manager,
          totals: { totalFeatures, deliveredCount, partialCount, notDeliveredCount },
          modules: modList
        };
      });

    return {
      contracts,
      totalFeatures: matching.length,
      truncated: matching.length >= 2000
    };
  }

  private buildFeatureDeliveryWhere(
    moduleId: string,
    query: { q?: string; deliveryStatus?: string; criticality?: string }
  ): Prisma.ContractFeatureWhereInput {
    const where: Prisma.ContractFeatureWhereInput = { moduleId };
    const q = (query.q ?? "").trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { itemCode: { contains: q, mode: "insensitive" } }
      ];
    }
    const ds = query.deliveryStatus?.trim();
    if (ds && Object.values(ContractItemDeliveryStatus).includes(ds as ContractItemDeliveryStatus)) {
      where.deliveryStatus = ds as ContractItemDeliveryStatus;
    }
    const cr = query.criticality?.trim();
    if (cr && Object.values(ContractItemCriticality).includes(cr as ContractItemCriticality)) {
      where.criticality = cr as ContractItemCriticality;
    }
    return where;
  }

  async findAll(): Promise<unknown> {
    // Lista enxuta: a edição abre `getContractFormData` / detalhe; não carregar fiscal/manager/supplier completos.
    return this.prisma.contract.findMany({
      where: { deletedAt: null, ...this.organizationScope() },
      select: {
        id: true,
        number: true,
        formalNumber: true,
        contractYear: true,
        internalCode: true,
        administrativeProcess: true,
        organizationId: true,
        contractTypeCatalogId: true,
        hiringTypeId: true,
        hiringProcedureNumber: true,
        name: true,
        managingUnit: true,
        companyName: true,
        cnpj: true,
        contractType: true,
        status: true,
        monthlyValue: true,
        startDate: true,
        endDate: true,
        supplierId: true,
        createdAt: true,
        updatedAt: true,
        organization: { select: { id: true, name: true, acronym: true, active: true } },
        hiringType: { select: { id: true, name: true } },
        _count: { select: { amendments: true, glpiGroups: true } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  /**
   * Confere o backfill dos campos financeiros legados para os itens de precificação.
   * Mantém os valores numéricos para a interface poder destacar divergências sem
   * depender da serialização Decimal do Prisma.
   */
  async pricingMigrationReview(): Promise<{
    summary: { migrated: number; pending: number; inconsistent: number; totalActive: number };
    contracts: Array<{
      id: string;
      name: string;
      number: string;
      status: ContractStatus;
      monthlyValue: number;
      installationValue: number | null;
      totalValue: number;
      pricingItemsCount: number;
      mensalidadeCount: number;
      implantacaoCount: number;
      flags: string[];
      migratedItems: Array<{
        id: string;
        description: string;
        typeCode: string;
        quantity: number;
        unitValue: number;
        totalValue: number;
      }>;
    }>;
  }> {
    const contracts = await this.prisma.contract.findMany({
      where: { deletedAt: null, status: ContractStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        number: true,
        status: true,
        monthlyValue: true,
        installationValue: true,
        totalValue: true,
        pricingItems: {
          select: {
            id: true,
            description: true,
            quantity: true,
            unitValue: true,
            totalValue: true,
            billingKind: true,
            periodicity: true,
            periodStart: true,
            periodEnd: true,
            status: true,
            type: { select: { code: true } }
          },
          orderBy: { sequence: "asc" }
        }
      },
      orderBy: { number: "asc" }
    });

    const nearlyEqual = (left: number, right: number) => Math.abs(left - right) < 0.01;
    const rows = contracts.map((contract) => {
      const activeItems = contract.pricingItems.filter((item) => item.status === "ACTIVE");
      const migratedItems = contract.pricingItems.filter((item) => {
        const description = item.description.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
        return (
          description.includes("migrad") ||
          description.includes("mensalidade do contrato") ||
          description.includes("implantacao do contrato")
        );
      });
      const mensalidadeItems = activeItems.filter((item) => item.type.code === "MENSALIDADE");
      const implantacaoItems = activeItems.filter((item) => item.type.code === "IMPLANTACAO");
      const monthlyValue = Number(contract.monthlyValue);
      const installationValue = contract.installationValue == null ? null : Number(contract.installationValue);
      const flags: string[] = [];

      if (migratedItems.length > 0) flags.push("MIGRATED");
      if (activeItems.length === 0) {
        flags.push("PENDING");
      } else {
        if (monthlyValue > 0 && mensalidadeItems.length === 0) flags.push("PENDING");
        if ((installationValue ?? 0) > 0 && implantacaoItems.length === 0) flags.push("PENDING");
      }
      if (mensalidadeItems.length > 1) flags.push("MULTIPLE_MENSALIDADE");

      const needsQuantityReview = activeItems.some((item) => Number(item.quantity) <= 0);
      if (needsQuantityReview) flags.push("QTY_UNDEFINED");
      const needsPeriodReview = activeItems.some(
        (item) =>
          item.billingKind === "RECURRING" &&
          (item.periodicity == null || item.periodStart == null || item.periodEnd == null)
      );
      if (needsPeriodReview) flags.push("PERIOD_UNDEFINED");

      const monthlyItemsValue = mensalidadeItems.reduce((sum, item) => {
        if (item.periodicity === "BIMONTHLY") return sum + Number(item.unitValue) / 2;
        if (item.periodicity === "QUARTERLY") return sum + Number(item.unitValue) / 3;
        if (item.periodicity === "SEMIANNUAL") return sum + Number(item.unitValue) / 6;
        if (item.periodicity === "ANNUAL") return sum + Number(item.unitValue) / 12;
        return sum + Number(item.unitValue);
      }, 0);
      const installationItemsValue = implantacaoItems.reduce((sum, item) => sum + Number(item.totalValue), 0);
      const monthlyDiverges = monthlyValue > 0 && mensalidadeItems.length > 0 && !nearlyEqual(monthlyValue, monthlyItemsValue);
      const installationDiverges =
        (installationValue ?? 0) > 0 &&
        implantacaoItems.length > 0 &&
        !nearlyEqual(installationValue ?? 0, installationItemsValue);
      if (monthlyDiverges || installationDiverges) flags.push("VALUE_DIVERGENCE");

      return {
        id: contract.id,
        name: contract.name,
        number: contract.number,
        status: contract.status,
        monthlyValue,
        installationValue,
        totalValue: Number(contract.totalValue),
        pricingItemsCount: activeItems.length,
        mensalidadeCount: mensalidadeItems.length,
        implantacaoCount: implantacaoItems.length,
        flags,
        migratedItems: migratedItems.map((item) => ({
          id: item.id,
          description: item.description,
          typeCode: item.type.code,
          quantity: Number(item.quantity),
          unitValue: Number(item.unitValue),
          totalValue: Number(item.totalValue)
        }))
      };
    });
    const inconsistentFlags = new Set(["MULTIPLE_MENSALIDADE", "QTY_UNDEFINED", "PERIOD_UNDEFINED", "VALUE_DIVERGENCE"]);

    return {
      summary: {
        migrated: rows.filter((row) => row.flags.includes("MIGRATED")).length,
        pending: rows.filter((row) => row.flags.includes("PENDING")).length,
        inconsistent: rows.filter((row) => row.flags.some((flag) => inconsistentFlags.has(flag))).length,
        totalActive: rows.length
      },
      contracts: rows
    };
  }

  /**
   * Conferência administrativa da migração de identificação (código interno vs número formal).
   * Não altera dados automaticamente — apenas lista pendências e divergências.
   */
  async identificationMigrationReview(): Promise<{
    summary: {
      total: number;
      withIssues: number;
      missingFormal: number;
      missingType: number;
      missingProcess: number;
      missingHiringType: number;
      yearMismatch: number;
      missingStartDate: number;
      organizationPending: number;
      missingInternalCode: number;
    };
    contracts: Array<{
      id: string;
      name: string;
      number: string;
      status: ContractStatus;
      internalCode: string | null;
      formalNumber: string | null;
      contractYear: number | null;
      administrativeProcess: string | null;
      hiringProcedureNumber: string | null;
      startDate: string | null;
      organizationPending: boolean;
      organizationName: string | null;
      contractTypeName: string | null;
      hiringTypeName: string | null;
      issues: IdentificationIssue[];
    }>;
  }> {
    const contracts = await this.prisma.contract.findMany({
      where: { deletedAt: null, ...this.organizationScope() },
      select: {
        id: true,
        name: true,
        number: true,
        status: true,
        internalCode: true,
        formalNumber: true,
        contractYear: true,
        administrativeProcess: true,
        hiringProcedureNumber: true,
        startDate: true,
        organizationPending: true,
        organizationId: true,
        contractTypeCatalogId: true,
        hiringTypeId: true,
        organization: { select: { name: true, acronym: true } },
        contractTypeCatalog: { select: { name: true, acronym: true } },
        hiringType: { select: { name: true } }
      },
      orderBy: [{ internalCode: "asc" }, { number: "asc" }]
    });

    const rows = contracts.map((contract) => {
      const issues = collectIdentificationIssues({
        formalNumber: contract.formalNumber,
        contractTypeCatalogId: contract.contractTypeCatalogId,
        administrativeProcess: contract.administrativeProcess,
        hiringTypeId: contract.hiringTypeId,
        startDate: contract.startDate,
        contractYear: contract.contractYear,
        internalCode: contract.internalCode,
        organizationPending: contract.organizationPending
      });
      return {
        id: contract.id,
        name: contract.name,
        number: contract.number,
        status: contract.status,
        internalCode: contract.internalCode,
        formalNumber: contract.formalNumber,
        contractYear: contract.contractYear,
        administrativeProcess: contract.administrativeProcess,
        hiringProcedureNumber: contract.hiringProcedureNumber,
        startDate: contract.startDate ? contract.startDate.toISOString() : null,
        organizationPending: contract.organizationPending,
        organizationName: contract.organization
          ? `${contract.organization.acronym} · ${contract.organization.name}`
          : null,
        contractTypeName: contract.contractTypeCatalog
          ? `${contract.contractTypeCatalog.acronym} · ${contract.contractTypeCatalog.name}`
          : null,
        hiringTypeName: contract.hiringType?.name ?? null,
        issues
      };
    });

    const withIssues = rows.filter((row) => row.issues.length > 0);
    const countIssue = (issue: IdentificationIssue) =>
      withIssues.filter((row) => row.issues.includes(issue)).length;

    return {
      summary: {
        total: rows.length,
        withIssues: withIssues.length,
        missingFormal: countIssue("MISSING_FORMAL_NUMBER"),
        missingType: countIssue("MISSING_CONTRACT_TYPE"),
        missingProcess: countIssue("MISSING_ADMIN_PROCESS"),
        missingHiringType: countIssue("MISSING_HIRING_TYPE"),
        yearMismatch: countIssue("YEAR_MISMATCH"),
        missingStartDate: countIssue("MISSING_START_DATE"),
        organizationPending: countIssue("ORGANIZATION_PENDING"),
        missingInternalCode: countIssue("MISSING_INTERNAL_CODE")
      },
      contracts: withIssues
    };
  }

  /**
   * Reaplica a migração de identificação de forma segura (somente correspondências certas)
   * e registra auditoria por contrato alterado. Não inventa número formal.
   */
  async repairIdentificationMigration(): Promise<{ scanned: number; updated: number }> {
    const contracts = await this.prisma.contract.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        number: true,
        internalCode: true,
        formalNumber: true,
        contractYear: true,
        contractTypeCatalogId: true,
        startDate: true
      }
    });

    const typeByAcronym = new Map(
      (
        await this.prisma.contractTypeCatalog.findMany({
          select: { id: true, acronym: true }
        })
      ).map((t) => [t.acronym.toUpperCase(), t.id] as const)
    );

    let updated = 0;
    for (const contract of contracts) {
      const before = { ...contract };
      const data: Prisma.ContractUpdateInput = {};
      const parsedFromNumber = parseInternalCode(contract.number);
      const parsedInternal = parseInternalCode(contract.internalCode) ?? parsedFromNumber;

      if (!contract.internalCode && parsedFromNumber) {
        const clash = await this.prisma.contract.findFirst({
          where: { internalCode: parsedFromNumber.raw, id: { not: contract.id }, deletedAt: null },
          select: { id: true }
        });
        if (!clash) data.internalCode = parsedFromNumber.raw;
      }

      const internalLike = (typeof data.internalCode === "string" ? data.internalCode : null) ?? contract.internalCode ?? contract.number;
      if (
        contract.formalNumber &&
        isFormalDerivedFromInternal(contract.formalNumber, internalLike)
      ) {
        data.formalNumber = null;
      }

      if (contract.contractYear == null && contract.startDate) {
        data.contractYear = contract.startDate.getUTCFullYear();
      }

      if (!contract.contractTypeCatalogId && parsedInternal) {
        const typeId = typeByAcronym.get(parsedInternal.acronym);
        if (typeId) data.contractTypeCatalog = { connect: { id: typeId } };
      }

      if (Object.keys(data).length === 0) continue;

      const next = await this.prisma.contract.update({
        where: { id: contract.id },
        data
      });
      await this.createAudit("Contract", contract.id, "IDENTIFICATION_MIGRATION", before, {
        internalCode: next.internalCode,
        formalNumber: next.formalNumber,
        contractYear: next.contractYear,
        contractTypeCatalogId: next.contractTypeCatalogId
      });
      updated += 1;
    }

    return { scanned: contracts.length, updated };
  }

  /**
   * Carga leve para o formulário de criação/edição — evita relações pesadas
   * (cronogramas, ocorrências, módulos) que podem falhar e derrubar a tela.
   */
  async findOneForForm(id: string): Promise<unknown> {
    const accessible = await this.accessibleContractWhere(id);
    const contract = await this.prisma.contract.findFirst({
      where: accessible,
      include: {
        fiscal: true,
        manager: true,
        supplier: true,
        organization: { select: { id: true, name: true, acronym: true, active: true } },
        contractTypeCatalog: {
          select: { id: true, name: true, acronym: true, legacyEnum: true, active: true }
        },
        hiringType: { select: { id: true, name: true, active: true } },
        glpiGroups: { orderBy: { glpiGroupName: "asc" } },
        pricingItems: {
          include: { type: true, unit: true },
          orderBy: { sequence: "asc" }
        }
      }
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado");
    let pricingLocked = false;
    try {
      pricingLocked = await this.pricing.contractHasMovements(id);
    } catch {
      pricingLocked = false;
    }
    return { ...contract, pricingLocked };
  }

  /** Registra falha de carregamento do formulário nos logs administrativos (sem dados sensíveis ao cliente). */
  async reportFormLoadFailure(input: {
    action?: string | null;
    contractId?: string | null;
    stage?: string | null;
    message?: string | null;
  }): Promise<{ ok: true }> {
    const action = (input.action ?? "unknown").trim().slice(0, 40) || "unknown";
    const stage = (input.stage ?? "unknown").trim().slice(0, 120) || "unknown";
    const message = (input.message ?? "").trim().slice(0, 500);
    const contractId = (input.contractId ?? "").trim() || null;
    await this.createAudit(
      "ContractForm",
      contractId ?? "new",
      "FORM_LOAD_FAILURE",
      null,
      {
        formAction: action === "edit" ? "edit" : action === "create" ? "create" : action,
        contractId,
        stage,
        message,
        at: new Date().toISOString()
      }
    );
    return { ok: true };
  }

  async findOne(id: string): Promise<unknown> {
    const accessible = await this.accessibleContractWhere(id);
    const contract = await this.prisma.contract.findFirst({
      where: accessible,
      include: {
        organization: { select: { id: true, name: true, acronym: true, active: true } },
        contractTypeCatalog: {
          select: { id: true, name: true, acronym: true, legacyEnum: true, active: true }
        },
        hiringType: { select: { id: true, name: true, active: true } },
        modules: {
          include: {
            features: {
              include: {
                validationGroup: {
                  select: {
                    id: true,
                    name: true,
                    active: true
                  }
                },
                responsibles: {
                  include: { user: { select: LINKED_USER_SELECT } },
                  orderBy: { createdAt: "asc" }
                }
              }
            },
            fiscals: {
              include: { user: { select: LINKED_USER_SELECT } },
              orderBy: { createdAt: "asc" }
            },
            validator: { select: LINKED_USER_SELECT },
            glosaPricingItem: { include: { type: true } }
          }
        },
        validationGroups: {
          include: {
            members: {
              include: { user: { select: LINKED_USER_SELECT } },
              orderBy: { createdAt: "asc" }
            },
            _count: { select: { features: true } }
          },
          orderBy: [{ active: "desc" }, { name: "asc" }]
        },
        schedules: {
          include: {
            responsibles: {
              include: { user: { select: LINKED_USER_SELECT } },
              orderBy: { createdAt: "asc" }
            },
            milestones: {
              include: {
                responsibles: {
                  include: { user: { select: LINKED_USER_SELECT } },
                  orderBy: { createdAt: "asc" }
                }
              },
              orderBy: { sequence: "asc" }
            },
            attachments: { orderBy: { createdAt: "desc" } }
          },
          orderBy: [{ status: "asc" }, { name: "asc" }, { version: "desc" }]
        },
        occurrences: {
          include: {
            internalResponsible: { select: LINKED_USER_SELECT },
            events: { orderBy: { createdAt: "desc" }, take: 50 },
            controladoriaCases: { orderBy: { createdAt: "desc" } }
          },
          orderBy: [{ detectionDate: "desc" }, { createdAt: "desc" }]
        },
        controladoriaCases: {
          include: {
            occurrence: { select: { id: true, title: true, status: true, type: true } }
          },
          orderBy: [{ createdAt: "desc" }]
        },
        services: true,
        fiscal: true,
        manager: true,
        supplier: true,
        glpiGroups: { orderBy: { glpiGroupName: "asc" } },
        amendments: {
          orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
          include: { items: { orderBy: { createdAt: "asc" } } }
        },
        pricingItems: {
          include: { type: true, unit: true },
          orderBy: { sequence: "asc" }
        }
      }
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado");
    const modules = sortModuleListFeatures(this.enrichModulesWithPeople(contract.modules));
    const validationGroups = contract.validationGroups.map((g) => {
      const members = g.members.map((m) => serializeLinkedUser(m.user));
      return {
        id: g.id,
        name: g.name,
        description: g.description,
        active: g.active,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        memberUserIds: members.map((u) => u.id),
        members,
        featuresCount: g._count.features
      };
    });
    const pricingTotals = summarizePricingItemsAsOf(contract.pricingItems, new Date());
    const pricingLocked = await this.pricing.contractHasMovements(id);
    const schedules = contract.schedules.map((s) => this.serializeSchedule(s));
    const occurrences = contract.occurrences.map((o) => this.serializeOccurrence(o));
    const controladoriaCases = contract.controladoriaCases.map((c) => this.serializeControladoriaCase(c));
    const {
      validationGroups: _vg,
      schedules: _schedules,
      occurrences: _occ,
      controladoriaCases: _cc,
      ...rest
    } = contract;
    return {
      ...rest,
      modules,
      validationGroups,
      schedules,
      occurrences,
      controladoriaCases,
      /** Carregado sob demanda em GET /contracts/:id/item-change-logs */
      itemChangeLogs: [],
      pricingTotals,
      pricingLocked,
      featureImplantationProportion: buildFeatureImplantationProportion({
        monthlyValue: contract.monthlyValue,
        installationValue: contract.installationValue,
        implementationPeriodStart: contract.implementationPeriodStart,
        implementationPeriodEnd: contract.implementationPeriodEnd,
        modules,
        at: new Date()
      })
    };
  }

  /**
   * Contrato enxuto para mutações de módulos/funcionalidades (ticket 95).
   * Evita recarregar cronogramas, ocorrências, aditivos, precificação e GLPI a cada PATCH.
   */
  private async findOneForStructure(id: string): Promise<unknown> {
    const accessible = await this.accessibleContractWhere(id);
    const contract = await this.prisma.contract.findFirst({
      where: accessible,
      include: {
        organization: { select: { id: true, name: true, acronym: true, active: true } },
        contractTypeCatalog: {
          select: { id: true, name: true, acronym: true, legacyEnum: true, active: true }
        },
        hiringType: { select: { id: true, name: true, active: true } },
        modules: {
          include: {
            features: {
              include: {
                validationGroup: {
                  select: {
                    id: true,
                    name: true,
                    active: true
                  }
                },
                responsibles: {
                  include: { user: { select: LINKED_USER_SELECT } },
                  orderBy: { createdAt: "asc" }
                }
              }
            },
            fiscals: {
              include: { user: { select: LINKED_USER_SELECT } },
              orderBy: { createdAt: "asc" }
            },
            validator: { select: LINKED_USER_SELECT },
            glosaPricingItem: { include: { type: true } }
          }
        },
        validationGroups: {
          include: {
            members: {
              include: { user: { select: LINKED_USER_SELECT } },
              orderBy: { createdAt: "asc" }
            },
            _count: { select: { features: true } }
          },
          orderBy: [{ active: "desc" }, { name: "asc" }]
        },
        fiscal: true,
        manager: true,
        supplier: true
      }
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado");
    const modules = sortModuleListFeatures(this.enrichModulesWithPeople(contract.modules));
    const validationGroups = contract.validationGroups.map((g) => {
      const members = g.members.map((m) => serializeLinkedUser(m.user));
      return {
        id: g.id,
        name: g.name,
        description: g.description,
        active: g.active,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        memberUserIds: members.map((u) => u.id),
        members,
        featuresCount: g._count.features
      };
    });
    const { validationGroups: _vg, ...rest } = contract;
    return {
      ...rest,
      modules,
      validationGroups,
      itemChangeLogs: [],
      featureImplantationProportion: buildFeatureImplantationProportion({
        monthlyValue: contract.monthlyValue,
        installationValue: contract.installationValue,
        implementationPeriodStart: contract.implementationPeriodStart,
        implementationPeriodEnd: contract.implementationPeriodEnd,
        modules,
        at: new Date()
      })
    };
  }

  async findItemChangeLogs(contractId: string): Promise<unknown> {
    const accessible = await this.accessibleContractWhere(contractId);
    const exists = await this.prisma.contract.findFirst({ where: accessible, select: { id: true } });
    if (!exists) throw new NotFoundException("Contrato não encontrado");
    return this.prisma.contractItemChangeLog.findMany({
      where: { contractId },
      orderBy: { changedAt: "desc" },
      take: 200
    });
  }

  /**
   * Registra aditivo/reajuste: versiona itens afetados, recalcula valor global e atualiza o contrato
   * quando os efeitos já vigem (ou mantém valores «vigentes hoje» se a data for futura).
   */
  async createAmendment(contractId: string, dto: CreateContractAmendmentDto): Promise<unknown> {
    const prev = await this.prisma.contract.findFirst({
      where: { id: contractId, deletedAt: null },
      include: {
        pricingItems: { include: { type: true, unit: true }, orderBy: { sequence: "asc" } }
      }
    });
    if (!prev) throw new NotFoundException("Contrato não encontrado");
    if (prev.status !== ContractStatus.ACTIVE) {
      throw new BadRequestException("Só é possível registrar aditivos para contratos em estado «Ativo».");
    }

    const idIssues = collectIdentificationIssues({
      formalNumber: prev.formalNumber,
      contractTypeCatalogId: prev.contractTypeCatalogId,
      administrativeProcess: prev.administrativeProcess,
      hiringTypeId: prev.hiringTypeId,
      startDate: prev.startDate,
      contractYear: prev.contractYear,
      internalCode: prev.internalCode,
      organizationPending: prev.organizationPending
    });
    if (idIssues.includes("MISSING_START_DATE")) {
      throw new BadRequestException(
        "Não é possível registrar aditivo: o contrato está incompleto (falta a data de início da vigência)."
      );
    }

    const effectsRaw = dto.effectsStartDate?.trim() || dto.effectiveDate?.trim();
    if (!effectsRaw) {
      throw new BadRequestException("Informe a data de início dos efeitos do aditivo.");
    }
    const description = dto.description?.trim();
    if (!description) {
      throw new BadRequestException("Informe a descrição/observação do aditivo.");
    }

    const effectiveDate = startOfUtcDay(new Date(effectsRaw));
    if (Number.isNaN(effectiveDate.getTime())) {
      throw new BadRequestException("Data de início dos efeitos inválida.");
    }

    let formalizationDate: Date | null = null;
    if (dto.formalizationDate?.trim()) {
      formalizationDate = startOfUtcDay(new Date(dto.formalizationDate));
      if (Number.isNaN(formalizationDate.getTime())) {
        throw new BadRequestException("Data de formalização inválida.");
      }
    }

    let newEnd: Date | null = null;
    if (dto.newEndDate?.trim()) {
      newEnd = startOfUtcDay(new Date(dto.newEndDate));
      if (Number.isNaN(newEnd.getTime())) {
        throw new BadRequestException("Nova data de término inválida.");
      }
      if (newEnd < prev.startDate) {
        throw new BadRequestException("A nova data de término não pode ser anterior à data de início do contrato.");
      }
    }

    const itemDtos = dto.items ?? [];
    if (itemDtos.length === 0 && dto.newTotalValue == null && dto.newMonthlyValue == null && !newEnd) {
      throw new BadRequestException(
        "Informe itens afetados e/ou novos valores/término para registrar o aditivo."
      );
    }

    const today = startOfUtcDay(new Date());
    const previousTotals = summarizePricingItemsAsOf(prev.pricingItems, today);
    const previousGlobal =
      prev.globalValueCurrent != null ? Number(prev.globalValueCurrent) : previousTotals.globalEstimated;

    type ItemRow = (typeof prev.pricingItems)[number];
    const working = new Map<string, ItemRow>(prev.pricingItems.map((i) => [i.id, { ...i }]));
    const amendmentItemCreates: Array<{
      action: ContractAmendmentItemAction;
      pricingItemId: string | null;
      resultPricingItemId: string | null;
      adjustmentPercent: Prisma.Decimal | null;
      beforeSnapshot: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      afterSnapshot: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    }> = [];
    const txOps: Array<(tx: Prisma.TransactionClient) => Promise<void>> = [];

    const nextSequence = () => {
      let max = 0;
      for (const i of working.values()) max = Math.max(max, i.sequence);
      return max + 1;
    };

    const dayBeforeEffects = addUtcDays(effectiveDate, -1);

    for (const row of itemDtos) {
      if (row.action === ContractAmendmentItemAction.CREATE) {
        const after = row.after;
        if (!after?.typeId || !after.unitId || !after.description?.trim()) {
          throw new BadRequestException("Para incluir item via aditivo, informe tipo, unidade e descrição.");
        }
        if (after.quantity == null || after.unitValue == null) {
          throw new BadRequestException("Para incluir item via aditivo, informe quantidade e valor unitário.");
        }
        const billingKind = after.billingKind ?? ContractPricingBillingKind.RECURRING;
        const periodicity =
          billingKind === ContractPricingBillingKind.RECURRING
            ? (after.periodicity ?? ContractPricingPeriodicity.MONTHLY)
            : (after.periodicity ?? null);
        const qty = Number(after.quantity);
        const unitVal = Number(after.unitValue);
        const totalManual = Boolean(after.totalManual);
        const expected = Math.round(qty * unitVal * 100) / 100;
        const totalVal = totalManual && after.totalValue != null ? Number(after.totalValue) : expected;
        const newId = crypto.randomUUID();
        const seq = nextSequence();
        const periodStart = after.periodStart ? startOfUtcDay(new Date(after.periodStart)) : effectiveDate;
        const periodEnd = after.periodEnd ? startOfUtcDay(new Date(after.periodEnd)) : null;
        const snapshotAfter = serializePricingItemSnapshot({
          id: newId,
          sequence: seq,
          typeId: after.typeId,
          description: after.description.trim(),
          unitId: after.unitId,
          quantity: qty,
          unitValue: unitVal,
          totalValue: totalVal,
          totalManual,
          totalJustification: after.totalJustification ?? null,
          billingKind,
          periodicity,
          periodStart,
          periodEnd,
          status: ContractPricingItemStatus.ACTIVE,
          includeInGlosaBase: Boolean(after.includeInGlosaBase)
        });
        amendmentItemCreates.push({
          action: ContractAmendmentItemAction.CREATE,
          pricingItemId: null,
          resultPricingItemId: newId,
          adjustmentPercent:
            row.adjustmentPercent != null ? new Prisma.Decimal(row.adjustmentPercent) : null,
          beforeSnapshot: Prisma.JsonNull,
          afterSnapshot: snapshotAfter as Prisma.InputJsonValue
        });
        txOps.push(async (tx) => {
          await tx.contractPricingItem.create({
            data: {
              id: newId,
              contractId,
              sequence: seq,
              typeId: after.typeId!,
              description: after.description!.trim(),
              unitId: after.unitId!,
              quantity: new Prisma.Decimal(qty),
              unitValue: new Prisma.Decimal(unitVal),
              totalValue: new Prisma.Decimal(totalVal),
              totalManual,
              totalJustification: totalManual ? (after.totalJustification ?? "").trim() || null : null,
              billingKind,
              periodicity,
              periodStart,
              periodEnd,
              status: ContractPricingItemStatus.ACTIVE,
              includeInGlosaBase: Boolean(after.includeInGlosaBase),
              consumptionEnabled: billingKind === ContractPricingBillingKind.ON_DEMAND,
              consumptionUnitId: null,
              consumptionAvailableQuantity: null,
              consumptionFinancialRule:
                billingKind === ContractPricingBillingKind.ON_DEMAND ? "BILLED_BY_CONSUMPTION" : null,
              consumptionAvailability:
                billingKind === ContractPricingBillingKind.ON_DEMAND ? "CONTRACT_TERM" : null,
              consumptionAccumulates: false,
              consumptionRequiresValidation: false
            }
          });
        });
        working.set(newId, {
          id: newId,
          contractId,
          sequence: seq,
          typeId: after.typeId,
          description: after.description.trim(),
          unitId: after.unitId,
          quantity: new Prisma.Decimal(qty),
          unitValue: new Prisma.Decimal(unitVal),
          totalValue: new Prisma.Decimal(totalVal),
          totalManual,
          totalJustification: totalManual ? (after.totalJustification ?? "").trim() || null : null,
          billingKind,
          periodicity,
          periodStart,
          periodEnd,
          status: ContractPricingItemStatus.ACTIVE,
          includeInGlosaBase: Boolean(after.includeInGlosaBase),
          consumedQuantity: new Prisma.Decimal(0),
          consumptionEnabled: billingKind === ContractPricingBillingKind.ON_DEMAND,
          consumptionUnitId: null,
          consumptionAvailableQuantity: null,
          consumptionFinancialRule:
            billingKind === ContractPricingBillingKind.ON_DEMAND ? ("BILLED_BY_CONSUMPTION" as const) : null,
          consumptionAvailability:
            billingKind === ContractPricingBillingKind.ON_DEMAND ? ("CONTRACT_TERM" as const) : null,
          consumptionAccumulates: false,
          consumptionRequiresValidation: false,
          consumptionAlertThresholds: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          type: null as never,
          unit: null as never
        } as ItemRow);
        continue;
      }

      if (!row.pricingItemId) {
        throw new BadRequestException("Informe o item contratual afetado.");
      }
      const source = working.get(row.pricingItemId);
      if (!source) {
        throw new BadRequestException("Item contratual informado no aditivo não foi encontrado.");
      }
      if (source.status !== ContractPricingItemStatus.ACTIVE) {
        throw new BadRequestException(`O item «${source.description}» não está ativo para alteração.`);
      }

      const beforeSnap = serializePricingItemSnapshot(source);

      if (row.action === ContractAmendmentItemAction.SUPPRESS) {
        const afterSnap = {
          ...beforeSnap,
          periodEnd: dayBeforeEffects.toISOString().slice(0, 10),
          status: ContractPricingItemStatus.CANCELLED
        };
        amendmentItemCreates.push({
          action: ContractAmendmentItemAction.SUPPRESS,
          pricingItemId: source.id,
          resultPricingItemId: source.id,
          adjustmentPercent:
            row.adjustmentPercent != null ? new Prisma.Decimal(row.adjustmentPercent) : null,
          beforeSnapshot: beforeSnap as Prisma.InputJsonValue,
          afterSnapshot: afterSnap as Prisma.InputJsonValue
        });
        const sourceId = source.id;
        txOps.push(async (tx) => {
          await tx.contractPricingItem.update({
            where: { id: sourceId },
            data: {
              periodEnd: dayBeforeEffects,
              status: ContractPricingItemStatus.CANCELLED
            }
          });
          await tx.contractModule.updateMany({
            where: { contractId, glosaPricingItemId: sourceId },
            data: { glosaPricingItemId: null }
          });
        });
        working.set(source.id, {
          ...source,
          periodEnd: dayBeforeEffects,
          status: ContractPricingItemStatus.CANCELLED
        });
        continue;
      }

      // UPDATE: fecha versão anterior e cria nova ACTIVE
      const after = row.after ?? {};
      const qty = after.quantity != null ? Number(after.quantity) : Number(source.quantity);
      const unitVal = after.unitValue != null ? Number(after.unitValue) : Number(source.unitValue);
      const billingKind = after.billingKind ?? source.billingKind;
      const periodicity =
        after.periodicity !== undefined
          ? after.periodicity
          : source.periodicity;
      const totalManual = after.totalManual != null ? Boolean(after.totalManual) : source.totalManual;
      const expected = Math.round(qty * unitVal * 100) / 100;
      const totalVal =
        totalManual && after.totalValue != null
          ? Number(after.totalValue)
          : after.totalValue != null
            ? Number(after.totalValue)
            : expected;
      const newId = crypto.randomUUID();
      const seq = nextSequence();
      const periodEnd =
        after.periodEnd !== undefined
          ? after.periodEnd
            ? startOfUtcDay(new Date(after.periodEnd))
            : null
          : source.periodEnd;
      const snapshotAfter = serializePricingItemSnapshot({
        id: newId,
        sequence: seq,
        typeId: after.typeId ?? source.typeId,
        description: (after.description ?? source.description).trim(),
        unitId: after.unitId ?? source.unitId,
        quantity: qty,
        unitValue: unitVal,
        totalValue: totalVal,
        totalManual,
        totalJustification:
          after.totalJustification !== undefined ? after.totalJustification : source.totalJustification,
        billingKind,
        periodicity: periodicity ?? null,
        periodStart: effectiveDate,
        periodEnd,
        status: ContractPricingItemStatus.ACTIVE,
        includeInGlosaBase:
          after.includeInGlosaBase != null ? Boolean(after.includeInGlosaBase) : source.includeInGlosaBase
      });
      amendmentItemCreates.push({
        action: ContractAmendmentItemAction.UPDATE,
        pricingItemId: source.id,
        resultPricingItemId: newId,
        adjustmentPercent:
          row.adjustmentPercent != null ? new Prisma.Decimal(row.adjustmentPercent) : null,
        beforeSnapshot: beforeSnap as Prisma.InputJsonValue,
        afterSnapshot: snapshotAfter as Prisma.InputJsonValue
      });
      const sourceId = source.id;
      const includeGlosa = snapshotAfter.includeInGlosaBase;
      txOps.push(async (tx) => {
        await tx.contractPricingItem.update({
          where: { id: sourceId },
          data: {
            periodEnd: dayBeforeEffects,
            // Mantém ACTIVE com periodEnd no passado até effectsStart; o filtro por data evita dupla contagem.
            status: ContractPricingItemStatus.ACTIVE
          }
        });
        await tx.contractPricingItem.create({
          data: {
            id: newId,
            contractId,
            sequence: seq,
            typeId: snapshotAfter.typeId,
            description: snapshotAfter.description,
            unitId: snapshotAfter.unitId,
            quantity: new Prisma.Decimal(qty),
            unitValue: new Prisma.Decimal(unitVal),
            totalValue: new Prisma.Decimal(totalVal),
            totalManual,
            totalJustification: snapshotAfter.totalJustification,
            billingKind,
            periodicity: periodicity ?? null,
            periodStart: effectiveDate,
            periodEnd,
            status: ContractPricingItemStatus.ACTIVE,
            includeInGlosaBase: includeGlosa,
            consumedQuantity: source.consumedQuantity,
            consumptionEnabled: source.consumptionEnabled,
            consumptionUnitId: source.consumptionUnitId,
            consumptionAvailableQuantity: source.consumptionAvailableQuantity,
            consumptionFinancialRule: source.consumptionFinancialRule,
            consumptionAvailability: source.consumptionAvailability,
            consumptionAccumulates: source.consumptionAccumulates,
            consumptionRequiresValidation: source.consumptionRequiresValidation,
            consumptionAlertThresholds:
              source.consumptionAlertThresholds === null
                ? Prisma.JsonNull
                : (source.consumptionAlertThresholds as Prisma.InputJsonValue)
          }
        });
        // Transfere vínculo de base de glosa para a nova versão.
        await tx.contractModule.updateMany({
          where: { contractId, glosaPricingItemId: sourceId },
          data: { glosaPricingItemId: newId }
        });
      });
      working.set(source.id, { ...source, periodEnd: dayBeforeEffects });
      working.set(newId, {
        ...source,
        id: newId,
        sequence: seq,
        typeId: snapshotAfter.typeId,
        description: snapshotAfter.description,
        unitId: snapshotAfter.unitId,
        quantity: new Prisma.Decimal(qty),
        unitValue: new Prisma.Decimal(unitVal),
        totalValue: new Prisma.Decimal(totalVal),
        totalManual,
        totalJustification: snapshotAfter.totalJustification,
        billingKind,
        periodicity: periodicity ?? null,
        periodStart: effectiveDate,
        periodEnd,
        status: ContractPricingItemStatus.ACTIVE,
        includeInGlosaBase: includeGlosa
      } as ItemRow);
    }

    const workingList = [...working.values()];
    const totalsAtEffects = summarizePricingItemsAsOf(workingList, effectiveDate);
    const totalsToday = summarizePricingItemsAsOf(workingList, today);

    const newMonthly =
      itemDtos.length > 0
        ? totalsAtEffects.monthlyValue
        : dto.newMonthlyValue != null
          ? Number(dto.newMonthlyValue)
          : Number(prev.monthlyValue);
    const newTotal =
      itemDtos.length > 0
        ? totalsAtEffects.globalEstimated
        : dto.newTotalValue != null
          ? Number(dto.newTotalValue)
          : Number(prev.totalValue);
    const newGlobal =
      itemDtos.length > 0
        ? totalsAtEffects.globalEstimated
        : dto.newTotalValue != null
          ? Number(dto.newTotalValue)
          : previousGlobal;

    if (newMonthly < 0 || newTotal < 0 || newGlobal < 0) {
      throw new BadRequestException("Valores não podem ser negativos.");
    }

    const effectsAlreadyStarted = effectiveDate.getTime() <= today.getTime();
    const applyContractValues = effectsAlreadyStarted || itemDtos.length === 0;
    // Valores «vigentes hoje» quando há itens com effects futuros.
    const contractMonthly = itemDtos.length > 0 ? totalsToday.monthlyValue : newMonthly;
    const contractTotal = itemDtos.length > 0 ? Math.max(totalsToday.globalEstimated, totalsToday.monthlyValue, 0) : newTotal;
    const contractGlobal = itemDtos.length > 0 ? totalsToday.globalEstimated : newGlobal;
    const contractInstallation =
      itemDtos.length > 0 ? totalsToday.installationValue : undefined;

    let computedAdjustment = dto.adjustmentPercent ?? null;
    if (computedAdjustment == null && previousGlobal > 0) {
      computedAdjustment = Math.round(((newGlobal - previousGlobal) / previousGlobal) * 10000) / 100;
    }

    const { created, updatedContract } = await this.prisma.$transaction(async (tx) => {
      for (const op of txOps) await op(tx);

      const ref = dto.referenceCode?.trim();
      const createdAmendment = await tx.contractAmendment.create({
        data: {
          contractId,
          type: dto.type ?? ContractAmendmentType.OUTRO,
          status: ContractAmendmentStatus.ACTIVE,
          referenceCode: ref ? ref : null,
          formalizationDate,
          effectiveDate,
          description,
          previousTotalValue: prev.totalValue,
          previousMonthlyValue: prev.monthlyValue,
          previousEndDate: prev.endDate,
          previousGlobalValue: new Prisma.Decimal(previousGlobal),
          newTotalValue: new Prisma.Decimal(newTotal),
          newMonthlyValue: new Prisma.Decimal(newMonthly),
          newEndDate: newEnd ?? prev.endDate,
          newGlobalValue: new Prisma.Decimal(newGlobal),
          adjustmentPercent: computedAdjustment != null ? new Prisma.Decimal(computedAdjustment) : null,
          indexReference: dto.indexReference?.trim() || null,
          actorId: getAuditActorId() === "system" ? null : getAuditActorId(),
          actorLabel: getAuditActorLabel() || null,
          items: {
            create: amendmentItemCreates.map((i) => ({
              action: i.action,
              pricingItemId: i.pricingItemId,
              resultPricingItemId: i.resultPricingItemId,
              adjustmentPercent: i.adjustmentPercent,
              beforeSnapshot: i.beforeSnapshot,
              afterSnapshot: i.afterSnapshot
            }))
          }
        },
        include: { items: true }
      });

      const updated = await tx.contract.update({
        where: { id: contractId },
        data: {
          ...(newEnd ? { endDate: newEnd } : {}),
          ...(applyContractValues || itemDtos.length > 0
            ? {
                monthlyValue: new Prisma.Decimal(Math.max(contractMonthly, 0)),
                totalValue: new Prisma.Decimal(Math.max(contractTotal, 0)),
                ...(contractInstallation !== undefined
                  ? {
                      installationValue:
                        contractInstallation != null ? new Prisma.Decimal(contractInstallation) : null
                    }
                  : {}),
                ...(prev.globalValueManual
                  ? {}
                  : { globalValueCurrent: new Prisma.Decimal(Math.max(contractGlobal, 0)) })
              }
            : {})
        }
      });
      return { created: createdAmendment, updatedContract: updated };
    });

    await this.createAudit("ContractAmendment", created.id, "CREATE", null, created);
    await this.createAudit("Contract", contractId, "AMEND", prev, updatedContract);
    for (const item of created.items ?? []) {
      await this.createAudit("ContractAmendmentItem", item.id, "CREATE", null, item);
    }
    return this.findOne(contractId);
  }

  /**
   * Cancelamento formal do aditivo (não reverte automaticamente os itens; use um aditivo corretivo).
   */
  async cancelAmendment(
    contractId: string,
    amendmentId: string,
    dto: CancelContractAmendmentDto
  ): Promise<unknown> {
    const justification = dto.justification?.trim();
    if (!justification || justification.length < 3) {
      throw new BadRequestException("Informe a justificativa do cancelamento (mínimo 3 caracteres).");
    }
    const amendment = await this.prisma.contractAmendment.findFirst({
      where: { id: amendmentId, contractId },
      include: { items: true }
    });
    if (!amendment) throw new NotFoundException("Aditivo não encontrado.");
    if (amendment.status === ContractAmendmentStatus.CANCELLED) {
      throw new BadRequestException("Este aditivo já está cancelado.");
    }

    const contract = await this.prisma.contract.findFirst({ where: { id: contractId, deletedAt: null } });
    if (!contract) throw new NotFoundException("Contrato não encontrado");

    const updated = await this.prisma.contractAmendment.update({
      where: { id: amendmentId },
      data: {
        status: ContractAmendmentStatus.CANCELLED,
        cancelJustification: justification,
        cancelledAt: new Date(),
        actorId: getAuditActorId() === "system" ? null : getAuditActorId(),
        actorLabel: getAuditActorLabel() || null
      },
      include: { items: true }
    });

    await this.createAudit("ContractAmendment", amendmentId, "CANCEL", amendment, updated);
    await this.createAudit("Contract", contractId, "AMEND_CANCEL", null, {
      amendmentId,
      justification
    });
    return this.findOne(contractId);
  }

  async update(id: string, dto: UpdateContractDto): Promise<unknown> {
    const prev = await this.prisma.contract.findFirst({ where: { id, deletedAt: null } });
    if (!prev) throw new NotFoundException("Contrato não encontrado");
    const prevGlpiGroups =
      dto.glpiGroups !== undefined
        ? await this.prisma.contractGlpiGroup.findMany({
            where: { contractId: id },
            select: { glpiGroupId: true, glpiGroupName: true },
            orderBy: { glpiGroupId: "asc" }
          })
        : [];
    const nextImplStart =
      dto.implementationPeriodStart !== undefined
        ? dto.implementationPeriodStart === null
          ? null
          : new Date(dto.implementationPeriodStart)
        : prev.implementationPeriodStart;
    const nextImplEnd =
      dto.implementationPeriodEnd !== undefined
        ? dto.implementationPeriodEnd === null
          ? null
          : new Date(dto.implementationPeriodEnd)
        : prev.implementationPeriodEnd;
    assertImplementationPeriodOrder(nextImplStart, nextImplEnd);
    const {
      glpiGroups,
      pricingItems,
      globalValueManual,
      globalValueCurrent,
      globalValueJustification,
      ...rest
    } = dto;
    const totalValue = dto.totalValue ?? (dto.monthlyValue != null ? dto.monthlyValue * 12 : undefined);

    if (globalValueManual === undefined && (globalValueCurrent !== undefined || globalValueJustification !== undefined)) {
      throw new BadRequestException("Informe a opção de ajuste manual para alterar o valor global.");
    }
    if (globalValueManual === true) {
      const justification = (globalValueJustification ?? "").trim();
      if (!justification) {
        throw new BadRequestException("Informe a justificativa para o ajuste manual do valor global.");
      }
      if (globalValueCurrent == null || globalValueCurrent < 0) {
        throw new BadRequestException("Informe um valor global manual válido.");
      }
    }

    let contractType = dto.contractType;
    if (dto.contractTypeCatalogId) {
      const catalog = await this.prisma.contractTypeCatalog.findUnique({
        where: { id: dto.contractTypeCatalogId }
      });
      if (!catalog) throw new BadRequestException("Tipo de contrato do catálogo não encontrado.");
      if (catalog.legacyEnum) contractType = catalog.legacyEnum;
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : prev.startDate;
    const contractYear = startDate.getFullYear();
    const formalNumber = dto.formalNumber !== undefined ? dto.formalNumber?.trim() || null : prev.formalNumber;
    const number = formalNumber ? `${formalNumber}/${contractYear}` : dto.number;
    await this.assertFormalNumberAvailable(formalNumber, contractYear, id);

    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        ...rest,
        ...(contractType !== undefined ? { contractType } : {}),
        ...(number !== undefined ? { number } : {}),
        ...(dto.formalNumber !== undefined ? { formalNumber } : {}),
        ...(dto.startDate ? { contractYear } : {}),
        ...(dto.administrativeProcess !== undefined
          ? { administrativeProcess: dto.administrativeProcess?.trim() || null }
          : {}),
        ...(dto.organizationId !== undefined ? { organizationId: dto.organizationId } : {}),
        ...(dto.contractTypeCatalogId !== undefined ? { contractTypeCatalogId: dto.contractTypeCatalogId } : {}),
        ...(dto.hiringTypeId !== undefined ? { hiringTypeId: dto.hiringTypeId } : {}),
        ...(dto.hiringProcedureNumber !== undefined
          ? { hiringProcedureNumber: dto.hiringProcedureNumber?.trim() || null }
          : {}),
        ...(glpiGroups !== undefined
          ? { glpiGroups: { deleteMany: {}, create: dedupeGlpiGroupLinks(glpiGroups) } }
          : {}),
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        totalValue: totalValue != null ? new Prisma.Decimal(totalValue) : undefined,
        monthlyValue: dto.monthlyValue != null ? new Prisma.Decimal(dto.monthlyValue) : undefined,
        slaTarget: dto.slaTarget != null ? new Prisma.Decimal(dto.slaTarget) : dto.slaTarget === null ? null : undefined,
        installationValue:
          dto.installationValue === undefined
            ? undefined
            : dto.installationValue === null
              ? null
              : new Prisma.Decimal(dto.installationValue),
        ...(globalValueManual === true
          ? {
              globalValueManual: true,
              globalValueCurrent: new Prisma.Decimal(globalValueCurrent!),
              globalValueJustification: globalValueJustification!.trim()
            }
          : globalValueManual === false
            ? {
                globalValueManual: false,
                globalValueJustification: null
              }
            : {}),
        implementationPeriodStart:
          dto.implementationPeriodStart === undefined
            ? undefined
            : dto.implementationPeriodStart === null
              ? null
              : new Date(dto.implementationPeriodStart),
        implementationPeriodEnd:
          dto.implementationPeriodEnd === undefined
            ? undefined
            : dto.implementationPeriodEnd === null
              ? null
              : new Date(dto.implementationPeriodEnd)
      }
    });
    await this.createAudit("Contract", id, "UPDATE", prev, updated);
    if (glpiGroups !== undefined) {
      const nextGlpiLinks = dedupeGlpiGroupLinks(glpiGroups);
      const glpiAudit = glpiGroupsAuditPayload(prevGlpiGroups, nextGlpiLinks);
      if (glpiAudit) {
        await this.createAudit(
          "ContractGlpiGroup",
          id,
          "UPDATE",
          { previousGroups: glpiAudit.previousGroups, removed: glpiAudit.removed },
          { newGroups: glpiAudit.newGroups, added: glpiAudit.added }
        );
      }
    }
    if (pricingItems !== undefined) {
      await this.pricing.replaceItems(id, pricingItems as PricingItemInput[], (action, oldData, newData) =>
        this.createAudit("ContractPricingItem", id, action, oldData, newData)
      );
    } else if (globalValueManual === false) {
      await this.pricing.syncContractTotalsFromItems(id);
    }
    return this.findOne(id);
  }

  /**
   * Gera excepcionalmente outro código interno, preservando o anterior no log de auditoria.
   * O sequencial nunca é reaproveitado, mesmo que o código anterior tenha sido incorreto.
   */
  async regenerateInternalCode(id: string, justification: string): Promise<unknown> {
    const normalizedJustification = justification?.trim() ?? "";
    if (normalizedJustification.length < 10) {
      throw new BadRequestException("Informe uma justificativa com pelo menos 10 caracteres.");
    }

    await this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, internalCode: true, contractTypeCatalogId: true, startDate: true }
      });
      if (!contract) throw new NotFoundException("Contrato não encontrado");
      if (!contract.contractTypeCatalogId) {
        throw new BadRequestException("O contrato não possui tipo de contrato do catálogo para gerar o código interno.");
      }
      if (!contract.startDate || Number.isNaN(contract.startDate.getTime())) {
        throw new BadRequestException("O contrato não possui uma data de início válida para gerar o código interno.");
      }

      const internalCode = await allocateInternalCode(
        tx,
        contract.contractTypeCatalogId,
        contract.startDate.getFullYear()
      );
      const updatedContract = await tx.contract.update({ where: { id }, data: { internalCode } });
      await tx.auditLog.create({
        data: {
          entity: "Contract",
          entityId: id,
          action: "REGENERATE_INTERNAL_CODE",
          userId: getAuditActorId(),
          oldData: { internalCode: contract.internalCode } as Prisma.InputJsonValue,
          newData: {
            internalCode: updatedContract.internalCode,
            justification: normalizedJustification
          } as Prisma.InputJsonValue
        }
      });
    });
    return this.findOne(id);
  }

  /**
   * Remove o contrato da listagem (soft-delete) quando não há movimentações relevantes.
   * Exige confirmação textual e justificativa; registra auditoria antes da exclusão.
   */
  async delete(id: string, dto: DeleteContractDto): Promise<{ ok: true; id: string }> {
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: { select: { id: true, name: true, cnpj: true } },
        fiscal: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } }
      }
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado");

    const justification = (dto.justification ?? "").trim();
    if (justification.length < 5) {
      throw new BadRequestException("Informe uma justificativa com pelo menos 5 caracteres.");
    }
    const confirmation = (dto.confirmation ?? "").trim();
    const expectedNumber = contract.number.trim();
    const okConfirm =
      confirmation.toUpperCase() === "EXCLUIR" || confirmation === expectedNumber;
    if (!okConfirm) {
      throw new BadRequestException(
        `Para confirmar, digite EXCLUIR ou o número do contrato («${expectedNumber}»).`
      );
    }

    const blockers = await this.collectContractDeleteBlockers(id);
    if (blockers.length > 0) {
      throw new BadRequestException(
        `Este contrato não pode ser excluído porque possui registros relacionados: ${blockers.join(
          ", "
        )}. Altere a situação para «Suspenso» ou «Encerrado» em vez de excluir.`
      );
    }

    const snapshot = {
      id: contract.id,
      number: contract.number,
      name: contract.name,
      companyName: contract.companyName,
      cnpj: contract.cnpj,
      contractType: contract.contractType,
      status: contract.status,
      monthlyValue: contract.monthlyValue,
      totalValue: contract.totalValue,
      installationValue: contract.installationValue,
      startDate: contract.startDate,
      endDate: contract.endDate,
      supplier: contract.supplier,
      fiscal: contract.fiscal,
      manager: contract.manager
    };

    await this.createAudit("Contract", id, "DELETE", snapshot, {
      justification,
      confirmation,
      deletedAt: new Date().toISOString()
    });

    await this.prisma.contract.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    return { ok: true, id };
  }

  private async collectContractDeleteBlockers(contractId: string): Promise<string[]> {
    const [
      measurements,
      amendments,
      governance,
      evaluatedFeatures,
      statusChangeLogs,
      consumedPricing
    ] = await Promise.all([
      this.prisma.measurement.count({ where: { contractId, deletedAt: null } }),
      this.prisma.contractAmendment.count({ where: { contractId } }),
      this.prisma.ticketGovernance.count({ where: { contractId } }),
      this.prisma.contractFeature.count({
        where: {
          module: { contractId },
          OR: [
            { deliveryStatus: { not: ContractItemDeliveryStatus.NOT_DELIVERED } },
            { status: { not: ContractFeatureStatus.NOT_STARTED } }
          ]
        }
      }),
      this.prisma.contractItemChangeLog.count({
        where: {
          contractId,
          action: ContractItemChangeAction.STATUS_CHANGED
        }
      }),
      this.prisma.contractPricingItem.count({
        where: { contractId, consumedQuantity: { gt: 0 } }
      })
    ]);

    const blockers: string[] = [];
    if (measurements > 0) blockers.push(`medições (${measurements})`);
    if (amendments > 0) blockers.push(`aditivos (${amendments})`);
    if (governance > 0) blockers.push(`chamados de governança (${governance})`);
    if (evaluatedFeatures > 0) blockers.push(`funcionalidades avaliadas (${evaluatedFeatures})`);
    if (statusChangeLogs > 0) blockers.push(`histórico de alterações de itens (${statusChangeLogs})`);
    if (consumedPricing > 0) blockers.push(`itens com consumo registrado (${consumedPricing})`);
    return blockers;
  }

  async listPricingCatalog() {
    // Inclui inativos para não quebrar edição de itens já vinculados a tipos/unidades desativados.
    const [types, units] = await Promise.all([this.pricing.listTypes(true), this.pricing.listUnits(true)]);
    return { types, units };
  }

  async createMeasureUnit(body: { code: string; label: string }) {
    return this.pricing.createUnit(body);
  }

  async createContractItemType(body: { code: string; label: string }) {
    return this.pricing.createType(body);
  }

  async listItemTypesAdmin() {
    return this.pricing.listTypesAdmin();
  }

  async createItemType(body: {
    code: string;
    label: string;
    description?: string;
    billingKind?: string | null;
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
    return this.pricing.createTypeAdmin(body as never);
  }

  async updateItemType(
    id: string,
    body: {
      label?: string;
      description?: string | null;
      billingKind?: string | null;
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
    return this.pricing.updateTypeAdmin(id, body as never);
  }

  async replacePricingItems(contractId: string, items: PricingItemDto[]) {
    await this.pricing.ensureContract(contractId);
    return this.pricing.replaceItems(contractId, items as PricingItemInput[], (action, oldData, newData) =>
      this.createAudit("ContractPricingItem", contractId, action, oldData, newData)
    );
  }

  /**
   * Importa módulos e funcionalidades a partir de linhas já validadas (planilha).
   * Com `replace`, remove todos os módulos e funcionalidades do contrato antes de importar.
   * Sem `replace`, acrescenta módulos novos e funcionalidades; módulos existentes são identificados pelo nome (sem distinção de maiúsculas).
   */
  async importModulesAndFeatures(
    contractId: string,
    rows: ContractStructureImportRow[],
    opts: { replace: boolean }
  ): Promise<unknown> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, deletedAt: null },
      select: { id: true, contractType: true }
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado");
    const typesWithModules: ContractType[] = [ContractType.SOFTWARE, ContractType.INFRA, ContractType.SERVICO];
    if (!typesWithModules.includes(contract.contractType)) {
      throw new BadRequestException("Este tipo de contrato não utiliza módulos e funcionalidades.");
    }
    if (!rows.length) throw new BadRequestException("Nenhuma linha válida para importar.");

    const validationGroups = await this.prisma.contractValidationGroup.findMany({
      where: { contractId, active: true },
      select: { id: true, name: true }
    });
    const groupByNormName = new Map(
      validationGroups.map((g) => [g.name.trim().toLowerCase(), g.id] as const)
    );
    const hasActiveGroups = validationGroups.length > 0;

    const unknownGroupRows: number[] = [];
    for (const row of rows) {
      const name = row.validationGroupName?.trim();
      if (!name) continue;
      if (!groupByNormName.has(name.toLowerCase())) {
        unknownGroupRows.push(row.sourceRow);
      }
    }
    if (unknownGroupRows.length > 0) {
      const sample = unknownGroupRows.slice(0, 5).join(", ");
      const more = unknownGroupRows.length > 5 ? ` (+${unknownGroupRows.length - 5})` : "";
      throw new BadRequestException(
        `Grupo de validação não encontrado no contrato (linhas ${sample}${more}). Cadastre o grupo antes ou deixe a coluna vazia para importar como «Grupo não definido».`
      );
    }

    const groups = new Map<
      string,
      { displayName: string; weight?: number; criticality: ContractItemCriticality; features: ContractStructureImportRow[] }
    >();
    for (const row of rows) {
      const key = moduleGroupKey(row.moduleName);
      const prev = groups.get(key);
      if (!prev) {
        groups.set(key, {
          displayName: row.moduleName.trim(),
          weight: row.moduleWeight,
          criticality: row.moduleCriticality ?? ContractItemCriticality.MEDIA,
          features: [row]
        });
      } else {
        if (prev.weight != null && row.moduleWeight != null && Math.abs(prev.weight - row.moduleWeight) > 1e-6) {
          throw new BadRequestException(
            `Peso do módulo inconsistente para «${row.moduleName.trim()}» (linhas ${prev.features[0]?.sourceRow} e ${row.sourceRow}).`
          );
        }
        if ((row.moduleCriticality ?? prev.criticality) !== prev.criticality) {
          throw new BadRequestException(
            `Criticidade do módulo inconsistente para «${row.moduleName.trim()}» (linhas ${prev.features[0]?.sourceRow} e ${row.sourceRow}).`
          );
        }
        prev.features.push(row);
      }
    }

    let undefinedGroupCount = 0;

    // Transacção interactiva: o timeout por padrão do Prisma (~5 s) é curto para planilhas grandes;
    // ultrapassar fecha a transação e as operações seguintes falham com «Transaction not found».
    const affectedModuleIds = await this.prisma.$transaction(
      async (tx) => {
        const affected: string[] = [];
        if (opts.replace) {
          await tx.contractFeature.deleteMany({ where: { module: { contractId } } });
          await tx.contractModule.deleteMany({ where: { contractId } });
        }
        for (const [, group] of groups) {
          let moduleId: string | undefined;
          if (!opts.replace) {
            const existing = await tx.contractModule.findFirst({
              where: {
                contractId,
                name: { equals: group.displayName, mode: "insensitive" }
              }
            });
            if (existing) moduleId = existing.id;
          }
          if (!moduleId) {
            const created = await tx.contractModule.create({
              data: {
                contractId,
                name: group.displayName,
                criticality: group.criticality,
                weight: new Prisma.Decimal(group.weight ?? 0)
              }
            });
            moduleId = created.id;
          }
          const mid = moduleId!;
          affected.push(mid);
          group.features.sort((a, b) => {
            const byCode = compareItemCodes(a.featureCode, b.featureCode);
            if (byCode !== 0) return byCode;
            return a.featureName.localeCompare(b.featureName, "pt-BR", { sensitivity: "base" });
          });
          const featureRows = group.features.map((fr) => {
            const gName = fr.validationGroupName?.trim();
            const validationGroupId = gName ? groupByNormName.get(gName.toLowerCase()) ?? null : null;
            if (!validationGroupId) undefinedGroupCount += 1;
            return {
              moduleId: mid,
              itemCode: fr.featureCode?.trim() || null,
              name: fr.featureName.trim(),
              criticality: fr.featureCriticality ?? ContractItemCriticality.MEDIA,
              weight: new Prisma.Decimal(fr.featureWeight ?? 0),
              status: fr.featureStatus ?? ContractFeatureStatus.NOT_STARTED,
              deliveryStatus: fr.featureDelivery ?? ContractItemDeliveryStatus.NOT_DELIVERED,
              validationGroupId
            };
          });
          if (featureRows.length > 0) {
            await tx.contractFeature.createMany({ data: featureRows });
          }
        }
        return affected;
      },
      { maxWait: 30_000, timeout: 180_000 }
    );

    await this.recalculateContractModuleWeights(contractId);
    for (const moduleId of affectedModuleIds) {
      await this.recalculateModuleFeatureWeights(moduleId);
    }

    await this.createAudit("Contract", contractId, "IMPORT_STRUCTURE", null, {
      rows: rows.length,
      replace: opts.replace,
      undefinedGroupCount,
      hadActiveValidationGroups: hasActiveGroups
    });
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.FEATURE,
      itemId: null,
      itemName: "Importação de módulos e funcionalidades",
      action: ContractItemChangeAction.BULK_IMPORTED,
      newData: {
        rows: rows.length,
        replace: opts.replace,
        undefinedGroupCount,
        warning:
          undefinedGroupCount > 0
            ? `${undefinedGroupCount} funcionalidade(s) importada(s) sem grupo de validação («Grupo não definido»). Atribua na estrutura do contrato.`
            : null
      }
    });
    const result = (await this.findOne(contractId)) as Record<string, unknown>;
    return {
      ...result,
      importSummary: {
        rows: rows.length,
        undefinedGroupCount,
        message:
          undefinedGroupCount > 0
            ? `Importação concluída. ${undefinedGroupCount} funcionalidade(s) ficaram como «Grupo não definido»${
                hasActiveGroups
                  ? " — o contrato possui grupos ativos; atribua o grupo na estrutura ou pela ação em massa."
                  : "."
              }`
            : `Importação concluída (${rows.length} linha(s)).`
      }
    };
  }

  async createModule(contractId: string, dto: CreateContractModuleDto): Promise<unknown> {
    await this.ensureContract(contractId);
    const fiscalUserIds = this.resolveFiscalUserIdsInput(dto.fiscalUserIds, dto.validatorId);
    await this.ensureUsersExist(fiscalUserIds);
    const glosaPricingItemId = await this.resolveModuleGlosaPricingItemId(contractId, dto.glosaPricingItemId);
    const created = await this.prisma.contractModule.create({
      data: {
        contractId,
        name: dto.name,
        criticality: dto.criticality ?? ContractItemCriticality.MEDIA,
        validatorId: fiscalUserIds[0] ?? null,
        glosaPricingItemId,
        weight: new Prisma.Decimal(dto.weight ?? 0)
      }
    });
    if (fiscalUserIds.length > 0) {
      await this.prisma.contractModuleFiscal.createMany({
        data: fiscalUserIds.map((userId) => ({ moduleId: created.id, userId })),
        skipDuplicates: true
      });
    }
    await this.recalculateContractModuleWeights(contractId);
    const recalculated = await this.prisma.contractModule.findUnique({ where: { id: created.id } });
    const auditNew = { ...(recalculated ?? created), fiscalUserIds, fiscalUsersAdded: fiscalUserIds };
    await this.createAudit("ContractModule", created.id, "CREATE", null, auditNew);
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.MODULE,
      itemId: created.id,
      itemName: recalculated?.name ?? created.name,
      action: ContractItemChangeAction.CREATED,
      criticalityAfter: recalculated?.criticality ?? created.criticality,
      newData: auditNew
    });
    return this.findOneForStructure(contractId);
  }

  async updateModule(contractId: string, moduleId: string, dto: UpdateContractModuleDto): Promise<unknown> {
    await this.ensureModule(contractId, moduleId);
    const glosaPricingItemId =
      dto.glosaPricingItemId === undefined
        ? undefined
        : await this.resolveModuleGlosaPricingItemId(contractId, dto.glosaPricingItemId);
    const prevFiscals = await this.prisma.contractModuleFiscal.findMany({
      where: { moduleId },
      select: { userId: true },
      orderBy: { createdAt: "asc" }
    });
    const prevFiscalIds = prevFiscals.map((f) => f.userId);
    const prev = await this.prisma.contractModule.findUnique({ where: { id: moduleId } });
    const nextFiscalIds =
      dto.fiscalUserIds !== undefined || dto.validatorId !== undefined
        ? this.resolveFiscalUserIdsInput(dto.fiscalUserIds, dto.validatorId)
        : null;
    if (nextFiscalIds) {
      await this.ensureUsersExist(nextFiscalIds);
    }
    const updated = await this.prisma.contractModule.update({
      where: { id: moduleId },
      data: {
        name: dto.name ?? undefined,
        criticality: dto.criticality ?? undefined,
        validatorId:
          nextFiscalIds !== null ? nextFiscalIds[0] ?? null : dto.validatorId === undefined ? undefined : dto.validatorId?.trim() || null,
        glosaPricingItemId,
        weight: dto.weight != null ? new Prisma.Decimal(dto.weight) : undefined
      }
    });
    let fiscalDiff: { added: string[]; removed: string[]; fiscalUserIds: string[] } | null = null;
    if (nextFiscalIds !== null) {
      fiscalDiff = await this.syncModuleFiscals(moduleId, nextFiscalIds, prevFiscalIds);
    }
    await this.recalculateContractModuleWeights(contractId);
    const recalculated = await this.prisma.contractModule.findUnique({ where: { id: moduleId } });
    const auditOld = { ...prev, fiscalUserIds: prevFiscalIds };
    const auditNew = {
      ...(recalculated ?? updated),
      fiscalUserIds: fiscalDiff?.fiscalUserIds ?? prevFiscalIds,
      fiscalUsersAdded: fiscalDiff?.added ?? [],
      fiscalUsersRemoved: fiscalDiff?.removed ?? []
    };
    await this.createAudit("ContractModule", moduleId, "UPDATE", auditOld, auditNew);
    if (fiscalDiff && (fiscalDiff.added.length > 0 || fiscalDiff.removed.length > 0)) {
      await this.createAudit("ContractModuleFiscal", moduleId, "UPDATE", {
        fiscalUserIds: prevFiscalIds,
        removed: fiscalDiff.removed
      }, {
        fiscalUserIds: fiscalDiff.fiscalUserIds,
        added: fiscalDiff.added
      });
    }
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.MODULE,
      itemId: moduleId,
      itemName: recalculated?.name ?? updated.name,
      action: ContractItemChangeAction.UPDATED,
      criticalityBefore: prev?.criticality ?? null,
      criticalityAfter: recalculated?.criticality ?? updated.criticality,
      oldData: auditOld,
      newData: auditNew
    });
    return this.findOneForStructure(contractId);
  }

  async deleteModule(contractId: string, moduleId: string): Promise<unknown> {
    await this.ensureModule(contractId, moduleId);
    const prev = await this.prisma.contractModule.findUnique({
      where: { id: moduleId },
      include: { features: true }
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.contractFeature.deleteMany({ where: { moduleId } });
        await tx.contractModule.delete({ where: { id: moduleId } });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        throw new BadRequestException("Não é possível remover o módulo: existem referências (ex.: medições).");
      }
      throw e;
    }
    await this.recalculateContractModuleWeights(contractId);
    await this.createAudit("ContractModule", moduleId, "DELETE", prev, null);
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.MODULE,
      itemId: moduleId,
      itemName: prev?.name ?? moduleId,
      action: ContractItemChangeAction.DELETED,
      criticalityBefore: prev?.criticality ?? null,
      oldData: prev
    });
    return this.findOneForStructure(contractId);
  }

  async createFeature(contractId: string, moduleId: string, dto: CreateContractFeatureDto): Promise<unknown> {
    await this.ensureModule(contractId, moduleId);
    const itemCode = dto.itemCode?.trim();
    if (!itemCode) {
      throw new BadRequestException("O campo obrigatório Código do Item deve ser preenchido antes de gravar a informação.");
    }
    const validationGroupId = dto.validationGroupId?.trim();
    if (!validationGroupId) {
      throw new BadRequestException("Selecione o grupo de validação da funcionalidade.");
    }
    await this.ensureValidationGroup(contractId, validationGroupId, { requireActive: true });
    const responsibleUserIds =
      dto.responsibleUserIds !== undefined ? normalizeUserIds(dto.responsibleUserIds) : [];
    await this.ensureUsersExist(responsibleUserIds);
    const created = await this.prisma.contractFeature.create({
      data: {
        moduleId,
        itemCode,
        name: dto.name,
        criticality: dto.criticality ?? ContractItemCriticality.MEDIA,
        weight: new Prisma.Decimal(dto.weight ?? 0),
        status: dto.status ?? ContractFeatureStatus.NOT_STARTED,
        deliveryStatus: dto.deliveryStatus ?? ContractItemDeliveryStatus.NOT_DELIVERED,
        validationGroupId
      }
    });
    if (responsibleUserIds.length > 0) {
      await this.prisma.contractFeatureResponsible.createMany({
        data: responsibleUserIds.map((userId) => ({ featureId: created.id, userId })),
        skipDuplicates: true
      });
    }
    await this.recalculateModuleFeatureWeights(moduleId);
    const recalculated = await this.prisma.contractFeature.findUnique({ where: { id: created.id } });
    const auditNew = {
      ...(recalculated ?? created),
      responsibleUserIds,
      validationGroupId,
      responsibilitySource: "GROUP_AND_FEATURE"
    };
    await this.createAudit("ContractFeature", created.id, "CREATE", null, auditNew);
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.FEATURE,
      itemId: created.id,
      itemName: featureDisplayName(recalculated?.itemCode ?? created.itemCode, recalculated?.name ?? created.name),
      action: ContractItemChangeAction.CREATED,
      criticalityAfter: recalculated?.criticality ?? created.criticality,
      statusAfter: recalculated?.status ?? created.status,
      deliveryStatusAfter: recalculated?.deliveryStatus ?? created.deliveryStatus,
      newData: auditNew
    });
    return this.findOneForStructure(contractId);
  }

  async updateFeature(
    contractId: string,
    moduleId: string,
    featureId: string,
    dto: UpdateContractFeatureDto
  ): Promise<unknown> {
    await this.ensureFeature(contractId, moduleId, featureId);
    if (dto.itemCode !== undefined && !dto.itemCode.trim()) {
      throw new BadRequestException("O campo obrigatório Código do Item deve ser preenchido antes de gravar a informação.");
    }
    const prevResponsibles = await this.prisma.contractFeatureResponsible.findMany({
      where: { featureId },
      select: { userId: true },
      orderBy: { createdAt: "asc" }
    });
    const prevResponsibleIds = prevResponsibles.map((r) => r.userId);
    const prev = await this.prisma.contractFeature.findUnique({ where: { id: featureId } });
    const nextResponsibleIds =
      dto.responsibleUserIds !== undefined ? normalizeUserIds(dto.responsibleUserIds) : null;
    if (nextResponsibleIds) {
      await this.ensureUsersExist(nextResponsibleIds);
    }
    let nextValidationGroupId: string | null | undefined = undefined;
    if (dto.validationGroupId !== undefined) {
      const raw = dto.validationGroupId?.trim() || null;
      if (raw) {
        await this.ensureValidationGroup(contractId, raw, { requireActive: true });
      }
      nextValidationGroupId = raw;
    }
    const updated = await this.prisma.contractFeature.update({
      where: { id: featureId },
      data: {
        itemCode: dto.itemCode !== undefined ? dto.itemCode.trim() : undefined,
        name: dto.name ?? undefined,
        weight: dto.weight != null ? new Prisma.Decimal(dto.weight) : undefined,
        criticality: dto.criticality ?? undefined,
        status: dto.status ?? undefined,
        deliveryStatus: dto.deliveryStatus ?? undefined,
        validationGroupId: nextValidationGroupId
      }
    });
    let responsibleDiff: { added: string[]; removed: string[]; responsibleUserIds: string[] } | null = null;
    if (nextResponsibleIds !== null) {
      responsibleDiff = await this.syncFeatureResponsibles(featureId, nextResponsibleIds, prevResponsibleIds);
    }
    await this.recalculateModuleFeatureWeights(moduleId);
    const recalculated = await this.prisma.contractFeature.findUnique({ where: { id: featureId } });
    const next = recalculated ?? updated;
    const finalResponsibleIds = responsibleDiff?.responsibleUserIds ?? prevResponsibleIds;
    const auditOld = {
      ...prev,
      responsibleUserIds: prevResponsibleIds,
      validationGroupId: prev?.validationGroupId ?? null
    };
    const auditNew = {
      ...(next as object),
      responsibleUserIds: finalResponsibleIds,
      responsibleUsersAdded: responsibleDiff?.added ?? [],
      responsibleUsersRemoved: responsibleDiff?.removed ?? [],
      validationGroupId: next.validationGroupId,
      responsibilitySource: next.validationGroupId
        ? finalResponsibleIds.length > 0
          ? "GROUP_AND_FEATURE"
          : "GROUP"
        : finalResponsibleIds.length > 0
          ? "FEATURE"
          : "UNDEFINED_GROUP",
      changeSource: dto.changeSource?.trim() || "CONTRACT_DETAIL"
    };
    await this.createAudit("ContractFeature", featureId, "UPDATE", auditOld, auditNew);
    if (responsibleDiff && (responsibleDiff.added.length > 0 || responsibleDiff.removed.length > 0)) {
      await this.createAudit("ContractFeatureResponsible", featureId, "UPDATE", {
        responsibleUserIds: prevResponsibleIds,
        removed: responsibleDiff.removed
      }, {
        responsibleUserIds: responsibleDiff.responsibleUserIds,
        added: responsibleDiff.added
      });
    }
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.FEATURE,
      itemId: featureId,
      itemName: featureDisplayName(next.itemCode, next.name),
      action:
        prev?.status !== next.status || prev?.deliveryStatus !== next.deliveryStatus
          ? ContractItemChangeAction.STATUS_CHANGED
          : ContractItemChangeAction.UPDATED,
      criticalityBefore: prev?.criticality ?? null,
      criticalityAfter: next.criticality,
      statusBefore: prev?.status ?? null,
      statusAfter: next.status,
      deliveryStatusBefore: prev?.deliveryStatus ?? null,
      deliveryStatusAfter: next.deliveryStatus,
      oldData: auditOld,
      newData: auditNew
    });
    return this.findOneForStructure(contractId);
  }

  async deleteFeature(contractId: string, moduleId: string, featureId: string): Promise<unknown> {
    await this.ensureFeature(contractId, moduleId, featureId);
    const prev = await this.prisma.contractFeature.findUnique({ where: { id: featureId } });
    try {
      await this.prisma.contractFeature.delete({ where: { id: featureId } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        throw new BadRequestException("Não é possível remover a funcionalidade: existem referências (ex.: medições).");
      }
      throw e;
    }
    await this.recalculateModuleFeatureWeights(moduleId);
    await this.createAudit("ContractFeature", featureId, "DELETE", prev, null);
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.FEATURE,
      itemId: featureId,
      itemName: prev ? featureDisplayName(prev.itemCode, prev.name) : featureId,
      action: ContractItemChangeAction.DELETED,
      criticalityBefore: prev?.criticality ?? null,
      statusBefore: prev?.status ?? null,
      deliveryStatusBefore: prev?.deliveryStatus ?? null,
      oldData: prev
    });
    return this.findOneForStructure(contractId);
  }

  async createService(contractId: string, dto: CreateContractServiceDto): Promise<unknown> {
    await this.ensureContract(contractId);
    const created = await this.prisma.contractService.create({
      data: {
        contractId,
        name: dto.name,
        unit: dto.unit,
        unitValue: new Prisma.Decimal(dto.unitValue)
      }
    });
    await this.createAudit("ContractService", created.id, "CREATE", null, created);
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.SERVICE,
      itemId: created.id,
      itemName: created.name,
      action: ContractItemChangeAction.CREATED,
      newData: created
    });
    return this.findOne(contractId);
  }

  async updateService(contractId: string, serviceId: string, dto: UpdateContractServiceDto): Promise<unknown> {
    await this.ensureService(contractId, serviceId);
    const prev = await this.prisma.contractService.findUnique({ where: { id: serviceId } });
    const updated = await this.prisma.contractService.update({
      where: { id: serviceId },
      data: {
        name: dto.name ?? undefined,
        unit: dto.unit ?? undefined,
        unitValue: dto.unitValue != null ? new Prisma.Decimal(dto.unitValue) : undefined
      }
    });
    await this.createAudit("ContractService", serviceId, "UPDATE", prev, updated);
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.SERVICE,
      itemId: serviceId,
      itemName: updated.name,
      action: ContractItemChangeAction.UPDATED,
      oldData: prev,
      newData: updated
    });
    return this.findOne(contractId);
  }

  async deleteService(contractId: string, serviceId: string): Promise<unknown> {
    await this.ensureService(contractId, serviceId);
    const prev = await this.prisma.contractService.findUnique({ where: { id: serviceId } });
    try {
      await this.prisma.contractService.delete({ where: { id: serviceId } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        throw new BadRequestException("Não é possível remover o serviço: existem referências (ex.: medições).");
      }
      throw e;
    }
    await this.createAudit("ContractService", serviceId, "DELETE", prev, null);
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.SERVICE,
      itemId: serviceId,
      itemName: prev?.name ?? serviceId,
      action: ContractItemChangeAction.DELETED,
      oldData: prev
    });
    return this.findOne(contractId);
  }

  private async ensureContract(contractId: string): Promise<void> {
    const c = await this.prisma.contract.findFirst({
      where: await this.accessibleContractWhere(contractId)
    });
    if (!c) throw new NotFoundException("Contrato não encontrado");
  }

  /**
   * Escopo pelo órgão do contexto ativo.
   * ADMIN com órgão específico NÃO bypassa o filtro; «Todos os órgãos» (org null) não filtra.
   * Usuário EXTERNAL: somente contratos autorizados (nunca visão global).
   */
  private organizationScope(): Prisma.ContractWhereInput {
    const actor = requestActorStore.getStore();
    if (actor?.userKind === "EXTERNAL" || actor?.role === "EXTERNAL") {
      const ids = actor.authorizedContractIds ?? [];
      return { id: { in: ids } };
    }
    if (actor?.allOrganizationsActive || !actor?.organizationId) {
      return {};
    }
    return { organizationId: actor.organizationId };
  }

  /** Contratos do órgão + contratos de outros órgãos onde o ator tem atribuição. */
  private assignmentExpandedContractOr(actorUserId: string): Prisma.ContractWhereInput[] {
    return [
      {
        validationGroups: { some: { members: { some: { userId: actorUserId } } } }
      },
      {
        modules: {
          some: {
            OR: [
              { fiscals: { some: { userId: actorUserId } } },
              { validatorId: actorUserId },
              {
                features: {
                  some: {
                    OR: [
                      { responsibles: { some: { userId: actorUserId } } },
                      { validationGroup: { members: { some: { userId: actorUserId } } } }
                    ]
                  }
                }
              }
            ]
          }
        }
      }
    ];
  }

  private async accessibleContractWhere(contractId: string): Promise<Prisma.ContractWhereInput> {
    const actor = requestActorStore.getStore();
    const base: Prisma.ContractWhereInput = { id: contractId, deletedAt: null };
    if (actor?.userKind === "EXTERNAL" || actor?.role === "EXTERNAL") {
      const ids = actor.authorizedContractIds ?? [];
      if (!ids.includes(contractId)) {
        return { ...base, id: "__denied__" };
      }
      return base;
    }
    if (!actor?.userId || actor.allOrganizationsActive || !actor.organizationId) {
      return { ...base, ...this.organizationScope() };
    }
    return {
      ...base,
      OR: [{ organizationId: actor.organizationId }, ...this.assignmentExpandedContractOr(actor.userId)]
    };
  }

  private async modulesDeliveryContractWhere(): Promise<Prisma.ContractWhereInput> {
    const actor = requestActorStore.getStore();
    const typeFilter: Prisma.ContractWhereInput = {
      deletedAt: null,
      contractType: { in: [ContractType.SOFTWARE, ContractType.INFRA, ContractType.SERVICO] }
    };
    if (!actor?.userId || actor.allOrganizationsActive || !actor.organizationId) {
      return { ...typeFilter, ...this.organizationScope() };
    }
    return {
      ...typeFilter,
      OR: [{ organizationId: actor.organizationId }, ...this.assignmentExpandedContractOr(actor.userId)]
    };
  }

  private featureAssignmentWhere(
    assignment: AssignmentFilter,
    actorUserId: string
  ): Prisma.ContractFeatureWhereInput {
    switch (assignment) {
      case "ASSIGNED_TO_ME":
        return {
          OR: [
            { responsibles: { some: { userId: actorUserId } } },
            { validationGroup: { members: { some: { userId: actorUserId } } } }
          ]
        };
      case "GROUP_MEMBER":
        return { validationGroup: { members: { some: { userId: actorUserId } } } };
      case "MODULE_FISCAL":
        return {
          module: {
            OR: [{ fiscals: { some: { userId: actorUserId } } }, { validatorId: actorUserId }]
          }
        };
      case "NO_RESPONSIBLE":
        return {
          AND: [
            { validationGroupId: null },
            { responsibles: { none: {} } }
          ]
        };
      default:
        return {};
    }
  }

  private async filterContractIdsByAssignment(
    contractIds: string[],
    assignment: AssignmentFilter,
    actorUserId: string
  ): Promise<string[]> {
    if (contractIds.length === 0 || assignment === "ALL") return contractIds;
    const featureWhere = this.featureAssignmentWhere(assignment, actorUserId);
    const rows = await this.prisma.contractFeature.findMany({
      where: {
        ...featureWhere,
        module: { contractId: { in: contractIds } }
      },
      select: { module: { select: { contractId: true } } },
      distinct: ["moduleId"]
    });
    const matched = new Set(rows.map((r) => r.module.contractId));
    if (assignment === "MODULE_FISCAL") {
      const mods = await this.prisma.contractModule.findMany({
        where: {
          contractId: { in: contractIds },
          OR: [{ fiscals: { some: { userId: actorUserId } } }, { validatorId: actorUserId }]
        },
        select: { contractId: true }
      });
      for (const m of mods) matched.add(m.contractId);
    }
    return contractIds.filter((id) => matched.has(id));
  }

  private scheduleInclude() {
    return {
      responsibles: {
        include: { user: { select: LINKED_USER_SELECT } },
        orderBy: { createdAt: "asc" as const }
      },
      milestones: {
        include: {
          responsibles: {
            include: { user: { select: LINKED_USER_SELECT } },
            orderBy: { createdAt: "asc" as const }
          }
        },
        orderBy: { sequence: "asc" as const }
      },
      attachments: { orderBy: { createdAt: "desc" as const } }
    };
  }

  private serializeSchedule(schedule: {
    id: string;
    contractId: string;
    name: string;
    type: ContractScheduleType;
    purpose: string | null;
    origin: ContractScheduleOrigin;
    description: string | null;
    plannedStartDate: Date | null;
    plannedEndDate: Date | null;
    companyResponsibles: string | null;
    status: ContractScheduleStatus;
    version: number;
    lineageId: string;
    replacedById: string | null;
    impactaFinanceiro: boolean;
    pricingItemId: string | null;
    observations: string | null;
    createdAt: Date;
    updatedAt: Date;
      responsibles?: Array<{ userId: string; user: LinkedUserRow }>;
    milestones?: Array<{
      id: string;
      sequence: number;
      activity: string;
      description: string | null;
      pricingItemId: string | null;
      featureId: string | null;
      plannedStartDate: Date | null;
      plannedEndDate: Date | null;
      actualStartDate: Date | null;
      actualEndDate: Date | null;
      percentComplete: Prisma.Decimal | null;
      status: ContractScheduleMilestoneStatus;
      dependencies: string | null;
      observations: string | null;
      responsibles?: Array<{ userId: string; user: LinkedUserRow }>;
    }>;
    attachments?: Array<{
      id: string;
      fileName: string;
      mimeType: string;
      filePath: string;
      createdAt: Date;
    }>;
  }) {
    const responsibleUsers = (schedule.responsibles ?? []).map((r) => serializeLinkedUser(r.user));
    const milestones = (schedule.milestones ?? []).map((m) => {
      const msUsers = (m.responsibles ?? []).map((r) => serializeLinkedUser(r.user));
      return {
        id: m.id,
        sequence: m.sequence,
        activity: m.activity,
        description: m.description,
        pricingItemId: m.pricingItemId,
        featureId: m.featureId,
        plannedStartDate: m.plannedStartDate,
        plannedEndDate: m.plannedEndDate,
        actualStartDate: m.actualStartDate,
        actualEndDate: m.actualEndDate,
        percentComplete: m.percentComplete != null ? Number(m.percentComplete) : null,
        status: m.status,
        dependencies: m.dependencies,
        observations: m.observations,
        responsibleUserIds: msUsers.map((u) => u.id),
        responsibleUsers: msUsers
      };
    });
    const attachments = (schedule.attachments ?? []).map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      filePath: a.filePath,
      createdAt: a.createdAt
    }));
    return {
      id: schedule.id,
      contractId: schedule.contractId,
      name: schedule.name,
      type: schedule.type,
      purpose: schedule.purpose,
      origin: schedule.origin,
      description: schedule.description,
      plannedStartDate: schedule.plannedStartDate,
      plannedEndDate: schedule.plannedEndDate,
      companyResponsibles: schedule.companyResponsibles,
      status: schedule.status,
      version: schedule.version,
      lineageId: schedule.lineageId,
      replacedById: schedule.replacedById,
      impactaFinanceiro: schedule.impactaFinanceiro,
      pricingItemId: schedule.pricingItemId,
      observations: schedule.observations,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
      responsibleUserIds: responsibleUsers.map((u) => u.id),
      responsibleUsers,
      milestones,
      attachments
    };
  }

  private parseOptionalDate(value: string | null | undefined): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value.trim() === "") return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException("Data inválida no cronograma.");
    }
    return d;
  }

  private async ensureSchedulePricingItem(contractId: string, pricingItemId: string | null | undefined): Promise<string | null | undefined> {
    if (pricingItemId === undefined) return undefined;
    if (pricingItemId === null || !pricingItemId.trim()) return null;
    const item = await this.prisma.contractPricingItem.findFirst({
      where: { id: pricingItemId.trim(), contractId },
      select: { id: true }
    });
    if (!item) throw new BadRequestException("Item contratual informado não pertence a este contrato.");
    return item.id;
  }

  private async ensureScheduleFeature(contractId: string, featureId: string | null | undefined): Promise<string | null> {
    if (featureId === undefined || featureId === null || !featureId.trim()) return null;
    const feature = await this.prisma.contractFeature.findFirst({
      where: { id: featureId.trim(), module: { contractId } },
      select: { id: true }
    });
    if (!feature) throw new BadRequestException("Funcionalidade informada não pertence a este contrato.");
    return feature.id;
  }

  private async normalizeMilestonesInput(
    contractId: string,
    milestones: ContractScheduleMilestoneDto[] | undefined
  ): Promise<
    Array<{
      sequence: number;
      activity: string;
      description: string | null;
      pricingItemId: string | null;
      featureId: string | null;
      plannedStartDate: Date | null;
      plannedEndDate: Date | null;
      actualStartDate: Date | null;
      actualEndDate: Date | null;
      percentComplete: number | null;
      status: ContractScheduleMilestoneStatus;
      dependencies: string | null;
      observations: string | null;
      responsibleUserIds: string[];
    }>
  > {
    if (!milestones) return [];
    const allUserIds = new Set<string>();
    const normalized = [];
    for (const m of milestones) {
      const activity = m.activity?.trim();
      if (!activity) throw new BadRequestException("Informe a atividade de cada etapa/marco.");
      const pricingItemId = await this.ensureSchedulePricingItem(contractId, m.pricingItemId ?? null);
      const featureId = await this.ensureScheduleFeature(contractId, m.featureId ?? null);
      const responsibleUserIds = normalizeUserIds(m.responsibleUserIds);
      for (const id of responsibleUserIds) allUserIds.add(id);
      const percent =
        m.percentComplete === undefined || m.percentComplete === null
          ? null
          : Number(m.percentComplete);
      if (percent != null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
        throw new BadRequestException("Percentual da etapa deve estar entre 0 e 100.");
      }
      normalized.push({
        sequence: m.sequence,
        activity,
        description: m.description?.trim() || null,
        pricingItemId: pricingItemId ?? null,
        featureId,
        plannedStartDate: this.parseOptionalDate(m.plannedStartDate) ?? null,
        plannedEndDate: this.parseOptionalDate(m.plannedEndDate) ?? null,
        actualStartDate: this.parseOptionalDate(m.actualStartDate) ?? null,
        actualEndDate: this.parseOptionalDate(m.actualEndDate) ?? null,
        percentComplete: percent,
        status: m.status ?? ContractScheduleMilestoneStatus.NAO_INICIADA,
        dependencies: m.dependencies?.trim() || null,
        observations: m.observations?.trim() || null,
        responsibleUserIds
      });
    }
    await this.ensureUsersExist([...allUserIds]);
    return normalized.sort((a, b) => a.sequence - b.sequence);
  }

  private isScheduleLockedForDirectEdit(status: ContractScheduleStatus): boolean {
    return (
      status === ContractScheduleStatus.APROVADO ||
      status === ContractScheduleStatus.EM_EXECUCAO ||
      status === ContractScheduleStatus.SUSPENSO
    );
  }

  private scheduleVersionSensitiveChanged(
    prev: {
      plannedStartDate: Date | null;
      plannedEndDate: Date | null;
      companyResponsibles: string | null;
      responsibles: Array<{ userId: string }>;
      milestones: Array<{
        sequence: number;
        activity: string;
        description: string | null;
        pricingItemId: string | null;
        featureId: string | null;
        plannedStartDate: Date | null;
        plannedEndDate: Date | null;
        actualStartDate: Date | null;
        actualEndDate: Date | null;
        percentComplete: Prisma.Decimal | null;
        status: ContractScheduleMilestoneStatus;
        dependencies: string | null;
        observations: string | null;
        responsibles: Array<{ userId: string }>;
      }>;
    },
    dto: UpdateContractScheduleDto,
    nextResponsibleIds: string[] | null,
    nextMilestones: Awaited<ReturnType<ContractsService["normalizeMilestonesInput"]>> | null
  ): boolean {
    if (dto.plannedStartDate !== undefined) {
      const next = this.parseOptionalDate(dto.plannedStartDate) ?? null;
      if ((prev.plannedStartDate?.toISOString() ?? null) !== (next?.toISOString() ?? null)) return true;
    }
    if (dto.plannedEndDate !== undefined) {
      const next = this.parseOptionalDate(dto.plannedEndDate) ?? null;
      if ((prev.plannedEndDate?.toISOString() ?? null) !== (next?.toISOString() ?? null)) return true;
    }
    if (nextResponsibleIds !== null) {
      const prevIds = [...prev.responsibles.map((r) => r.userId)].sort();
      const nextIds = [...nextResponsibleIds].sort();
      if (prevIds.join("|") !== nextIds.join("|")) return true;
    }
    if (dto.companyResponsibles !== undefined) {
      const next = dto.companyResponsibles?.trim() || null;
      if ((prev.companyResponsibles ?? null) !== next) return true;
    }
    if (nextMilestones !== null) {
      const prevKey = JSON.stringify(
        prev.milestones.map((m) => ({
          sequence: m.sequence,
          activity: m.activity,
          description: m.description,
          pricingItemId: m.pricingItemId,
          featureId: m.featureId,
          plannedStartDate: m.plannedStartDate?.toISOString() ?? null,
          plannedEndDate: m.plannedEndDate?.toISOString() ?? null,
          actualStartDate: m.actualStartDate?.toISOString() ?? null,
          actualEndDate: m.actualEndDate?.toISOString() ?? null,
          percentComplete: m.percentComplete != null ? Number(m.percentComplete) : null,
          status: m.status,
          dependencies: m.dependencies,
          observations: m.observations,
          responsibleUserIds: [...m.responsibles.map((r) => r.userId)].sort()
        }))
      );
      const nextKey = JSON.stringify(
        nextMilestones.map((m) => ({
          sequence: m.sequence,
          activity: m.activity,
          description: m.description,
          pricingItemId: m.pricingItemId,
          featureId: m.featureId,
          plannedStartDate: m.plannedStartDate?.toISOString() ?? null,
          plannedEndDate: m.plannedEndDate?.toISOString() ?? null,
          actualStartDate: m.actualStartDate?.toISOString() ?? null,
          actualEndDate: m.actualEndDate?.toISOString() ?? null,
          percentComplete: m.percentComplete,
          status: m.status,
          dependencies: m.dependencies,
          observations: m.observations,
          responsibleUserIds: [...m.responsibleUserIds].sort()
        }))
      );
      if (prevKey !== nextKey) return true;
    }
    return false;
  }

  private async replaceScheduleMilestones(
    scheduleId: string,
    milestones: Awaited<ReturnType<ContractsService["normalizeMilestonesInput"]>>
  ): Promise<void> {
    await this.prisma.contractScheduleMilestone.deleteMany({ where: { scheduleId } });
    for (const m of milestones) {
      await this.prisma.contractScheduleMilestone.create({
        data: {
          scheduleId,
          sequence: m.sequence,
          activity: m.activity,
          description: m.description,
          pricingItemId: m.pricingItemId,
          featureId: m.featureId,
          plannedStartDate: m.plannedStartDate,
          plannedEndDate: m.plannedEndDate,
          actualStartDate: m.actualStartDate,
          actualEndDate: m.actualEndDate,
          percentComplete: m.percentComplete,
          status: m.status,
          dependencies: m.dependencies,
          observations: m.observations,
          responsibles:
            m.responsibleUserIds.length > 0
              ? { create: m.responsibleUserIds.map((userId) => ({ userId })) }
              : undefined
        }
      });
    }
  }

  async listSchedules(contractId: string): Promise<unknown> {
    await this.ensureContract(contractId);
    const rows = await this.prisma.contractSchedule.findMany({
      where: { contractId },
      include: this.scheduleInclude(),
      orderBy: [{ status: "asc" }, { name: "asc" }, { version: "desc" }]
    });
    return rows.map((s) => this.serializeSchedule(s));
  }

  async createSchedule(contractId: string, dto: CreateContractScheduleDto): Promise<unknown> {
    await this.ensureContract(contractId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("Informe o nome do cronograma.");
    const status = dto.status ?? ContractScheduleStatus.RASCUNHO;
    if (
      status === ContractScheduleStatus.SUBSTITUIDO ||
      status === ContractScheduleStatus.APROVADO ||
      status === ContractScheduleStatus.CONCLUIDO
    ) {
      throw new BadRequestException(
        "Novo cronograma deve nascer como rascunho (ou em análise/ajustes). Use a ação de aprovar quando estiver pronto."
      );
    }
    const responsibleUserIds = normalizeUserIds(dto.responsibleUserIds);
    await this.ensureUsersExist(responsibleUserIds);
    const pricingItemId = (await this.ensureSchedulePricingItem(contractId, dto.pricingItemId ?? null)) ?? null;
    const milestones = await this.normalizeMilestonesInput(contractId, dto.milestones);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.contractSchedule.create({
        data: {
          contractId,
          name,
          type: dto.type,
          purpose: dto.purpose?.trim() || null,
          origin: dto.origin ?? ContractScheduleOrigin.OUTRO,
          description: dto.description?.trim() || null,
          plannedStartDate: this.parseOptionalDate(dto.plannedStartDate) ?? null,
          plannedEndDate: this.parseOptionalDate(dto.plannedEndDate) ?? null,
          companyResponsibles: dto.companyResponsibles?.trim() || null,
          status,
          version: 1,
          lineageId: "pending",
          impactaFinanceiro: dto.impactaFinanceiro ?? false,
          pricingItemId,
          observations: dto.observations?.trim() || null,
          responsibles:
            responsibleUserIds.length > 0
              ? { create: responsibleUserIds.map((userId) => ({ userId })) }
              : undefined
        }
      });
      await tx.contractSchedule.update({
        where: { id: row.id },
        data: { lineageId: row.id }
      });
      for (const m of milestones) {
        await tx.contractScheduleMilestone.create({
          data: {
            scheduleId: row.id,
            sequence: m.sequence,
            activity: m.activity,
            description: m.description,
            pricingItemId: m.pricingItemId,
            featureId: m.featureId,
            plannedStartDate: m.plannedStartDate,
            plannedEndDate: m.plannedEndDate,
            actualStartDate: m.actualStartDate,
            actualEndDate: m.actualEndDate,
            percentComplete: m.percentComplete,
            status: m.status,
            dependencies: m.dependencies,
            observations: m.observations,
            responsibles:
              m.responsibleUserIds.length > 0
                ? { create: m.responsibleUserIds.map((userId) => ({ userId })) }
                : undefined
          }
        });
      }
      return tx.contractSchedule.findUniqueOrThrow({
        where: { id: row.id },
        include: this.scheduleInclude()
      });
    });
    const serialized = this.serializeSchedule(created);
    await this.createAudit("ContractSchedule", created.id, "CREATE", null, serialized);
    return this.findOne(contractId);
  }

  async updateSchedule(
    contractId: string,
    scheduleId: string,
    dto: UpdateContractScheduleDto
  ): Promise<unknown> {
    const prev = await this.prisma.contractSchedule.findFirst({
      where: { id: scheduleId, contractId },
      include: this.scheduleInclude()
    });
    if (!prev) throw new NotFoundException("Cronograma não encontrado neste contrato.");
    if (
      prev.status === ContractScheduleStatus.SUBSTITUIDO ||
      prev.status === ContractScheduleStatus.CANCELADO
    ) {
      throw new BadRequestException("Cronograma substituído ou cancelado não pode ser editado.");
    }
    if (prev.status === ContractScheduleStatus.CONCLUIDO) {
      throw new BadRequestException("Cronograma concluído não pode ser editado. Crie um novo se necessário.");
    }

    const nextResponsibleIds =
      dto.responsibleUserIds !== undefined ? normalizeUserIds(dto.responsibleUserIds) : null;
    if (nextResponsibleIds) await this.ensureUsersExist(nextResponsibleIds);
    const nextPricingItemId = await this.ensureSchedulePricingItem(contractId, dto.pricingItemId);
    const nextMilestones =
      dto.milestones !== undefined
        ? await this.normalizeMilestonesInput(contractId, dto.milestones)
        : null;

    if (dto.status === ContractScheduleStatus.APROVADO) {
      throw new BadRequestException("Use a ação «Aprovar cronograma» para aprovar formalmente.");
    }
    if (dto.status === ContractScheduleStatus.SUBSTITUIDO) {
      throw new BadRequestException("Situação SUBSTITUIDO é reservada ao versionamento automático.");
    }

    const needsVersion =
      this.isScheduleLockedForDirectEdit(prev.status) &&
      this.scheduleVersionSensitiveChanged(prev, dto, nextResponsibleIds, nextMilestones);

    if (needsVersion) {
      const created = await this.prisma.$transaction(async (tx) => {
        const baseName = dto.name !== undefined ? dto.name.trim() : prev.name;
        if (!baseName) throw new BadRequestException("Informe o nome do cronograma.");
        const newRow = await tx.contractSchedule.create({
          data: {
            contractId,
            name: baseName,
            type: dto.type ?? prev.type,
            purpose: dto.purpose !== undefined ? dto.purpose?.trim() || null : prev.purpose,
            origin: dto.origin ?? prev.origin,
            description:
              dto.description !== undefined ? dto.description?.trim() || null : prev.description,
            plannedStartDate:
              dto.plannedStartDate !== undefined
                ? this.parseOptionalDate(dto.plannedStartDate) ?? null
                : prev.plannedStartDate,
            plannedEndDate:
              dto.plannedEndDate !== undefined
                ? this.parseOptionalDate(dto.plannedEndDate) ?? null
                : prev.plannedEndDate,
            companyResponsibles:
              dto.companyResponsibles !== undefined
                ? dto.companyResponsibles?.trim() || null
                : prev.companyResponsibles,
            status: ContractScheduleStatus.RASCUNHO,
            version: prev.version + 1,
            lineageId: prev.lineageId,
            impactaFinanceiro:
              dto.impactaFinanceiro !== undefined ? dto.impactaFinanceiro : prev.impactaFinanceiro,
            pricingItemId:
              nextPricingItemId !== undefined ? nextPricingItemId : prev.pricingItemId,
            observations:
              dto.observations !== undefined ? dto.observations?.trim() || null : prev.observations,
            responsibles: {
              create: (nextResponsibleIds ?? prev.responsibles.map((r) => r.userId)).map(
                (userId) => ({ userId })
              )
            }
          }
        });
        const milestonesSource =
          nextMilestones ??
          prev.milestones.map((m) => ({
            sequence: m.sequence,
            activity: m.activity,
            description: m.description,
            pricingItemId: m.pricingItemId,
            featureId: m.featureId,
            plannedStartDate: m.plannedStartDate,
            plannedEndDate: m.plannedEndDate,
            actualStartDate: m.actualStartDate,
            actualEndDate: m.actualEndDate,
            percentComplete: m.percentComplete != null ? Number(m.percentComplete) : null,
            status: m.status,
            dependencies: m.dependencies,
            observations: m.observations,
            responsibleUserIds: m.responsibles.map((r) => r.userId)
          }));
        for (const m of milestonesSource) {
          await tx.contractScheduleMilestone.create({
            data: {
              scheduleId: newRow.id,
              sequence: m.sequence,
              activity: m.activity,
              description: m.description,
              pricingItemId: m.pricingItemId,
              featureId: m.featureId,
              plannedStartDate: m.plannedStartDate,
              plannedEndDate: m.plannedEndDate,
              actualStartDate: m.actualStartDate,
              actualEndDate: m.actualEndDate,
              percentComplete: m.percentComplete,
              status: m.status,
              dependencies: m.dependencies,
              observations: m.observations,
              responsibles:
                m.responsibleUserIds.length > 0
                  ? { create: m.responsibleUserIds.map((userId) => ({ userId })) }
                  : undefined
            }
          });
        }
        await tx.contractSchedule.update({
          where: { id: prev.id },
          data: {
            status: ContractScheduleStatus.SUBSTITUIDO,
            replacedById: newRow.id
          }
        });
        return tx.contractSchedule.findUniqueOrThrow({
          where: { id: newRow.id },
          include: this.scheduleInclude()
        });
      });
      await this.createAudit("ContractSchedule", prev.id, "VERSION", this.serializeSchedule(prev), {
        replacedById: created.id,
        newVersion: created.version
      });
      await this.createAudit("ContractSchedule", created.id, "CREATE", null, {
        ...this.serializeSchedule(created),
        versionedFromId: prev.id
      });
      return this.findOne(contractId);
    }

    // Edição direta (rascunho / análise / ajustes) ou alteração não sensível em aprovado.
    if (
      this.isScheduleLockedForDirectEdit(prev.status) &&
      dto.status !== undefined &&
      dto.status !== prev.status &&
      dto.status !== ContractScheduleStatus.EM_EXECUCAO &&
      dto.status !== ContractScheduleStatus.SUSPENSO &&
      dto.status !== ContractScheduleStatus.CONCLUIDO &&
      dto.status !== ContractScheduleStatus.CANCELADO
    ) {
      throw new BadRequestException(
        "Após aprovado, só é possível avançar para Em execução, Suspenso, Concluído ou Cancelado — ou gerar nova versão ao alterar datas/etapas/responsáveis."
      );
    }

    await this.prisma.contractSchedule.update({
      where: { id: scheduleId },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        type: dto.type,
        purpose: dto.purpose !== undefined ? dto.purpose?.trim() || null : undefined,
        origin: dto.origin,
        description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
        plannedStartDate:
          dto.plannedStartDate !== undefined
            ? this.parseOptionalDate(dto.plannedStartDate) ?? null
            : undefined,
        plannedEndDate:
          dto.plannedEndDate !== undefined
            ? this.parseOptionalDate(dto.plannedEndDate) ?? null
            : undefined,
        companyResponsibles:
          dto.companyResponsibles !== undefined
            ? dto.companyResponsibles?.trim() || null
            : undefined,
        status: dto.status,
        impactaFinanceiro: dto.impactaFinanceiro,
        pricingItemId: nextPricingItemId === undefined ? undefined : nextPricingItemId,
        observations:
          dto.observations !== undefined ? dto.observations?.trim() || null : undefined
      }
    });

    if (nextResponsibleIds !== null) {
      const prevIds = prev.responsibles.map((r) => r.userId);
      const prevSet = new Set(prevIds);
      const nextSet = new Set(nextResponsibleIds);
      const added = nextResponsibleIds.filter((id) => !prevSet.has(id));
      const removed = prevIds.filter((id) => !nextSet.has(id));
      if (removed.length > 0) {
        await this.prisma.contractScheduleInternalResponsible.deleteMany({
          where: { scheduleId, userId: { in: removed } }
        });
      }
      if (added.length > 0) {
        await this.prisma.contractScheduleInternalResponsible.createMany({
          data: added.map((userId) => ({ scheduleId, userId })),
          skipDuplicates: true
        });
      }
    }

    if (nextMilestones !== null) {
      await this.replaceScheduleMilestones(scheduleId, nextMilestones);
    }

    const next = await this.prisma.contractSchedule.findUniqueOrThrow({
      where: { id: scheduleId },
      include: this.scheduleInclude()
    });
    await this.createAudit(
      "ContractSchedule",
      scheduleId,
      "UPDATE",
      this.serializeSchedule(prev),
      this.serializeSchedule(next)
    );
    return this.findOne(contractId);
  }

  async approveSchedule(contractId: string, scheduleId: string): Promise<unknown> {
    const prev = await this.prisma.contractSchedule.findFirst({
      where: { id: scheduleId, contractId },
      include: this.scheduleInclude()
    });
    if (!prev) throw new NotFoundException("Cronograma não encontrado neste contrato.");
    if (
      prev.status !== ContractScheduleStatus.RASCUNHO &&
      prev.status !== ContractScheduleStatus.ENVIADO_ANALISE &&
      prev.status !== ContractScheduleStatus.AJUSTES_SOLICITADOS
    ) {
      throw new BadRequestException(
        "Só é possível aprovar cronogramas em rascunho, enviados para análise ou com ajustes solicitados."
      );
    }
    const updated = await this.prisma.contractSchedule.update({
      where: { id: scheduleId },
      data: { status: ContractScheduleStatus.APROVADO },
      include: this.scheduleInclude()
    });
    await this.createAudit(
      "ContractSchedule",
      scheduleId,
      "APPROVE",
      this.serializeSchedule(prev),
      this.serializeSchedule(updated)
    );
    return this.findOne(contractId);
  }

  async deleteSchedule(contractId: string, scheduleId: string): Promise<unknown> {
    const prev = await this.prisma.contractSchedule.findFirst({
      where: { id: scheduleId, contractId },
      include: this.scheduleInclude()
    });
    if (!prev) throw new NotFoundException("Cronograma não encontrado neste contrato.");
    if (
      prev.status !== ContractScheduleStatus.RASCUNHO &&
      prev.status !== ContractScheduleStatus.CANCELADO
    ) {
      throw new BadRequestException(
        "Só é possível excluir cronogramas em rascunho ou cancelados. Demais situações devem ser canceladas ou substituídas por nova versão."
      );
    }
    await this.prisma.contractSchedule.delete({ where: { id: scheduleId } });
    await this.createAudit("ContractSchedule", scheduleId, "DELETE", this.serializeSchedule(prev), null);
    return this.findOne(contractId);
  }

  async addScheduleAttachmentUpload(
    contractId: string,
    scheduleId: string,
    file: Express.Multer.File
  ): Promise<unknown> {
    const schedule = await this.prisma.contractSchedule.findFirst({
      where: { id: scheduleId, contractId },
      select: { id: true }
    });
    if (!schedule) throw new NotFoundException("Cronograma não encontrado neste contrato.");
    if (!file.buffer?.length) {
      throw new BadRequestException("Arquivo vazio");
    }
    const { filePath } = await this.storage.saveScheduleFile(
      scheduleId,
      file.buffer,
      file.originalname,
      file.mimetype
    );
    const attachment = await this.prisma.attachment.create({
      data: {
        scheduleId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        filePath
      }
    });
    await this.createAudit("Attachment", attachment.id, "CREATE", null, attachment);
    return attachment;
  }

  async removeScheduleAttachment(
    contractId: string,
    scheduleId: string,
    attachmentId: string
  ): Promise<{ ok: true }> {
    const schedule = await this.prisma.contractSchedule.findFirst({
      where: { id: scheduleId, contractId },
      select: { id: true }
    });
    if (!schedule) throw new NotFoundException("Cronograma não encontrado neste contrato.");
    const att = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, scheduleId }
    });
    if (!att) throw new NotFoundException("Anexo não encontrado neste cronograma");
    await this.storage.unlinkStoredByRelativeSafe(att.filePath);
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    await this.createAudit("Attachment", attachmentId, "DELETE", att, null);
    return { ok: true };
  }

  private async ensureValidationGroup(
    contractId: string,
    groupId: string,
    opts?: { requireActive?: boolean }
  ): Promise<void> {
    const group = await this.prisma.contractValidationGroup.findFirst({
      where: { id: groupId, contractId },
      select: { id: true, active: true }
    });
    if (!group) throw new NotFoundException("Grupo de validação não encontrado neste contrato.");
    if (opts?.requireActive && !group.active) {
      throw new BadRequestException("O grupo de validação selecionado está inativo.");
    }
  }

  private serializeValidationGroup(group: {
    id: string;
    name: string;
    description: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    members: Array<{ user: LinkedUserRow }>;
    _count?: { features: number };
  }) {
    const members = group.members.map((m) => serializeLinkedUser(m.user));
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      active: group.active,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      memberUserIds: members.map((u) => u.id),
      members,
      featuresCount: group._count?.features ?? 0
    };
  }

  async listValidationGroups(contractId: string): Promise<unknown> {
    await this.ensureContract(contractId);
    const groups = await this.prisma.contractValidationGroup.findMany({
      where: { contractId },
      include: {
        members: {
          include: { user: { select: LINKED_USER_SELECT } },
          orderBy: { createdAt: "asc" }
        },
        _count: { select: { features: true } }
      },
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });
    return groups.map((g) => this.serializeValidationGroup(g));
  }

  async createValidationGroup(contractId: string, dto: CreateContractValidationGroupDto): Promise<unknown> {
    await this.ensureContract(contractId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("Informe o nome do grupo de validação.");
    const memberUserIds = normalizeUserIds(dto.memberUserIds);
    await this.ensureUsersExist(memberUserIds);
    const created = await this.prisma.contractValidationGroup.create({
      data: {
        contractId,
        name,
        description: dto.description?.trim() || null,
        active: dto.active ?? true,
        members:
          memberUserIds.length > 0
            ? { create: memberUserIds.map((userId) => ({ userId })) }
            : undefined
      },
      include: {
        members: {
          include: { user: { select: LINKED_USER_SELECT } },
          orderBy: { createdAt: "asc" }
        },
        _count: { select: { features: true } }
      }
    });
    const serialized = this.serializeValidationGroup(created);
    await this.createAudit("ContractValidationGroup", created.id, "CREATE", null, serialized);
    return this.findOne(contractId);
  }

  async updateValidationGroup(
    contractId: string,
    groupId: string,
    dto: UpdateContractValidationGroupDto
  ): Promise<unknown> {
    await this.ensureValidationGroup(contractId, groupId);
    const prev = await this.prisma.contractValidationGroup.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: { user: { select: LINKED_USER_SELECT } },
          orderBy: { createdAt: "asc" }
        },
        _count: { select: { features: true } }
      }
    });
    if (!prev) throw new NotFoundException("Grupo de validação não encontrado.");
    const nextMemberIds =
      dto.memberUserIds !== undefined ? normalizeUserIds(dto.memberUserIds) : null;
    if (nextMemberIds) await this.ensureUsersExist(nextMemberIds);

    const updated = await this.prisma.contractValidationGroup.update({
      where: { id: groupId },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
        active: dto.active ?? undefined
      }
    });

    let memberDiff: { added: string[]; removed: string[] } | null = null;
    if (nextMemberIds !== null) {
      const prevIds = prev.members.map((m) => m.userId);
      const prevSet = new Set(prevIds);
      const nextSet = new Set(nextMemberIds);
      const added = nextMemberIds.filter((id) => !prevSet.has(id));
      const removed = prevIds.filter((id) => !nextSet.has(id));
      if (removed.length > 0) {
        await this.prisma.contractValidationGroupMember.deleteMany({
          where: { groupId, userId: { in: removed } }
        });
      }
      if (added.length > 0) {
        await this.prisma.contractValidationGroupMember.createMany({
          data: added.map((userId) => ({ groupId, userId })),
          skipDuplicates: true
        });
      }
      memberDiff = { added, removed };
    }

    const next = await this.prisma.contractValidationGroup.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: { user: { select: LINKED_USER_SELECT } },
          orderBy: { createdAt: "asc" }
        },
        _count: { select: { features: true } }
      }
    });
    const auditOld = this.serializeValidationGroup(prev);
    const auditNew = {
      ...this.serializeValidationGroup(next!),
      membersAdded: memberDiff?.added ?? [],
      membersRemoved: memberDiff?.removed ?? []
    };
    await this.createAudit("ContractValidationGroup", groupId, "UPDATE", auditOld, auditNew);
    if (memberDiff && (memberDiff.added.length > 0 || memberDiff.removed.length > 0)) {
      await this.createAudit(
        "ContractValidationGroupMember",
        groupId,
        "UPDATE",
        { memberUserIds: prev.members.map((m) => m.userId), removed: memberDiff.removed },
        { memberUserIds: next!.members.map((m) => m.userId), added: memberDiff.added }
      );
    }
    void updated;
    return this.findOne(contractId);
  }

  /**
   * Não exclui fisicamente se houver funcionalidades vinculadas — apenas inativa.
   * Sem vínculos, permite exclusão definitiva.
   */
  async deleteValidationGroup(contractId: string, groupId: string): Promise<unknown> {
    await this.ensureValidationGroup(contractId, groupId);
    const prev = await this.prisma.contractValidationGroup.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: { user: { select: LINKED_USER_SELECT } },
          orderBy: { createdAt: "asc" }
        },
        _count: { select: { features: true } }
      }
    });
    if (!prev) throw new NotFoundException("Grupo de validação não encontrado.");
    if (prev._count.features > 0) {
      if (!prev.active) {
        throw new BadRequestException(
          "Este grupo possui funcionalidades vinculadas e já está inativo. Remova o vínculo das funcionalidades antes de excluir."
        );
      }
      const inactivated = await this.prisma.contractValidationGroup.update({
        where: { id: groupId },
        data: { active: false },
        include: {
          members: {
            include: { user: { select: LINKED_USER_SELECT } },
            orderBy: { createdAt: "asc" }
          },
          _count: { select: { features: true } }
        }
      });
      await this.createAudit(
        "ContractValidationGroup",
        groupId,
        "UPDATE",
        this.serializeValidationGroup(prev),
        { ...this.serializeValidationGroup(inactivated), inactivatedBecauseLinkedFeatures: true }
      );
      return this.findOne(contractId);
    }
    await this.prisma.contractValidationGroup.delete({ where: { id: groupId } });
    await this.createAudit("ContractValidationGroup", groupId, "DELETE", this.serializeValidationGroup(prev), null);
    return this.findOne(contractId);
  }

  async bulkUpdateFeatureValidationGroup(
    contractId: string,
    dto: BulkUpdateFeatureValidationGroupDto
  ): Promise<unknown> {
    await this.ensureContract(contractId);
    const featureIds = normalizeUserIds(dto.featureIds);
    if (featureIds.length === 0) {
      throw new BadRequestException("Informe ao menos uma funcionalidade.");
    }
    const validationGroupId = dto.validationGroupId?.trim() || null;
    if (validationGroupId) {
      await this.ensureValidationGroup(contractId, validationGroupId, { requireActive: true });
    }
    const features = await this.prisma.contractFeature.findMany({
      where: { id: { in: featureIds }, module: { contractId } },
      select: { id: true, validationGroupId: true, name: true, itemCode: true }
    });
    if (features.length !== featureIds.length) {
      throw new BadRequestException("Uma ou mais funcionalidades não pertencem a este contrato.");
    }
    await this.prisma.contractFeature.updateMany({
      where: { id: { in: featureIds } },
      data: { validationGroupId }
    });
    await this.createAudit("ContractFeature", contractId, "BULK_VALIDATION_GROUP", {
      featureIds,
      previous: features.map((f) => ({ id: f.id, validationGroupId: f.validationGroupId }))
    }, {
      featureIds,
      validationGroupId
    });
    return this.findOne(contractId);
  }

  private async assertFormalNumberAvailable(
    formalNumber: string | null,
    contractYear: number,
    excludeId?: string
  ): Promise<void> {
    if (!formalNumber) return;
    const duplicate = await this.prisma.contract.findFirst({
      where: {
        formalNumber,
        contractYear,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {})
      },
      select: { id: true }
    });
    if (duplicate) {
      throw new BadRequestException(`Já existe contrato com o número formal ${formalNumber}/${contractYear}.`);
    }
  }

  private async ensureUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException("Usuário responsável não encontrado");
  }

  private async ensureUsersExist(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const found = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true }
    });
    if (found.length !== userIds.length) {
      throw new NotFoundException("Um ou mais usuários selecionados não foram encontrados.");
    }
  }

  /** Aceita `fiscalUserIds` (preferido) ou o legado `validatorId`. */
  private resolveFiscalUserIdsInput(
    fiscalUserIds: string[] | undefined,
    validatorId: string | null | undefined
  ): string[] {
    if (fiscalUserIds !== undefined) {
      return normalizeUserIds(fiscalUserIds);
    }
    const single = validatorId?.trim();
    return single ? [single] : [];
  }

  private async syncModuleFiscals(
    moduleId: string,
    nextIds: string[],
    prevIds: string[]
  ): Promise<{ added: string[]; removed: string[]; fiscalUserIds: string[] }> {
    const prevSet = new Set(prevIds);
    const nextSet = new Set(nextIds);
    const added = nextIds.filter((id) => !prevSet.has(id));
    const removed = prevIds.filter((id) => !nextSet.has(id));
    if (removed.length > 0) {
      await this.prisma.contractModuleFiscal.deleteMany({
        where: { moduleId, userId: { in: removed } }
      });
    }
    if (added.length > 0) {
      await this.prisma.contractModuleFiscal.createMany({
        data: added.map((userId) => ({ moduleId, userId })),
        skipDuplicates: true
      });
    }
    return { added, removed, fiscalUserIds: nextIds };
  }

  private async syncFeatureResponsibles(
    featureId: string,
    nextIds: string[],
    prevIds: string[]
  ): Promise<{ added: string[]; removed: string[]; responsibleUserIds: string[] }> {
    const prevSet = new Set(prevIds);
    const nextSet = new Set(nextIds);
    const added = nextIds.filter((id) => !prevSet.has(id));
    const removed = prevIds.filter((id) => !nextSet.has(id));
    if (removed.length > 0) {
      await this.prisma.contractFeatureResponsible.deleteMany({
        where: { featureId, userId: { in: removed } }
      });
    }
    if (added.length > 0) {
      await this.prisma.contractFeatureResponsible.createMany({
        data: added.map((userId) => ({ featureId, userId })),
        skipDuplicates: true
      });
    }
    return { added, removed, responsibleUserIds: nextIds };
  }

  private resolveModuleFiscalUsers(mod: {
    fiscals?: Array<{ user: LinkedUserRow }>;
    validator?: LinkedUserRow | null;
  }): ContractLinkedUser[] {
    const fromLinks = (mod.fiscals ?? []).map((f) => serializeLinkedUser(f.user));
    if (fromLinks.length > 0) return fromLinks;
    return mod.validator ? [serializeLinkedUser(mod.validator)] : [];
  }

  private enrichModulesWithPeople<T extends {
    fiscals?: Array<{ user: LinkedUserRow }>;
    validator?: LinkedUserRow | null;
    features: Array<{
      validationGroupId?: string | null;
      validationGroup?: {
        id: string;
        name: string;
        active: boolean;
        members?: Array<{ user: LinkedUserRow }>;
      } | null;
      responsibles?: Array<{ user: LinkedUserRow }>;
    }>;
  }>(modules: T[]): T[] {
    return modules.map((mod) => {
      const fiscalUsers = this.resolveModuleFiscalUsers(mod);
      const features = mod.features.map((feat) => {
        const responsibleUsers = (feat.responsibles ?? []).map((r) => serializeLinkedUser(r.user));
        const groupMembers = (feat.validationGroup?.members ?? []).map((m) => serializeLinkedUser(m.user));
        const responsibility = resolveFeatureResponsibility({
          validationGroupId: feat.validationGroupId,
          validationGroup: feat.validationGroup
            ? {
                id: feat.validationGroup.id,
                name: feat.validationGroup.name,
                active: feat.validationGroup.active,
                members: groupMembers
              }
            : null,
          responsibleUsers
        });
        const { responsibles: _responsibles, validationGroup: _vg, ...featRest } = feat;
        return {
          ...featRest,
          ...responsibility,
          responsibilitySource: responsibility.groupUndefined
            ? responsibleUsers.length > 0
              ? ("FEATURE" as const)
              : ("UNDEFINED_GROUP" as const)
            : responsibleUsers.length > 0
              ? ("GROUP_AND_FEATURE" as const)
              : ("GROUP" as const),
          moduleFollowers: fiscalUsers
        };
      });
      const { fiscals: _fiscals, ...modRest } = mod;
      return {
        ...modRest,
        fiscalUsers,
        fiscalUserIds: fiscalUsers.map((u) => u.id),
        moduleFollowers: fiscalUsers,
        validator: mod.validator
          ? {
              id: mod.validator.id,
              email: mod.validator.email,
              role: mod.validator.role,
              name: resolveUserDisplayName(mod.validator)
            }
          : null,
        features
      } as unknown as T;
    });
  }

  private async resolveModuleGlosaPricingItemId(contractId: string, pricingItemId: string | null | undefined): Promise<string | null> {
    const id = pricingItemId?.trim();
    if (!id) return null;
    const item = await this.prisma.contractPricingItem.findFirst({
      where: { id, contractId, status: ContractPricingItemStatus.ACTIVE },
      include: { type: { select: { code: true, participatesInGlosa: true } } }
    });
    if (!item) {
      throw new BadRequestException("O item de base de glosa deve estar ativo e pertencer a este contrato.");
    }
    if (!item.includeInGlosaBase && !item.type.participatesInGlosa && item.type.code !== "MENSALIDADE") {
      throw new BadRequestException("O item selecionado não está habilitado para compor a base de glosa.");
    }
    return item.id;
  }

  private async recalculateContractModuleWeights(contractId: string): Promise<void> {
    const modules = await this.prisma.contractModule.findMany({
      where: { contractId },
      select: { id: true, criticality: true }
    });
    const total = modules.reduce((sum, mod) => sum + criticalityScore(mod.criticality), 0);
    if (total <= 0) return;
    await this.prisma.$transaction(
      modules.map((mod) =>
        this.prisma.contractModule.update({
          where: { id: mod.id },
          data: {
            weight: new Prisma.Decimal(criticalityScore(mod.criticality)).div(total).toDecimalPlaces(8)
          }
        })
      )
    );
  }

  private async recalculateModuleFeatureWeights(moduleId: string): Promise<void> {
    const features = await this.prisma.contractFeature.findMany({
      where: { moduleId },
      select: { id: true, criticality: true }
    });
    const total = features.reduce((sum, feature) => sum + criticalityScore(feature.criticality), 0);
    if (total <= 0) {
      await this.prisma.$transaction(
        features.map((feature) =>
          this.prisma.contractFeature.update({
            where: { id: feature.id },
            data: { weight: new Prisma.Decimal(0) }
          })
        )
      );
      return;
    }
    await this.prisma.$transaction(
      features.map((feature) =>
        this.prisma.contractFeature.update({
          where: { id: feature.id },
          data: {
            weight: new Prisma.Decimal(criticalityScore(feature.criticality)).div(total).toDecimalPlaces(8)
          }
        })
      )
    );
  }

  private async ensureModule(contractId: string, moduleId: string): Promise<void> {
    const m = await this.prisma.contractModule.findFirst({ where: { id: moduleId, contractId } });
    if (!m) throw new NotFoundException("Módulo não encontrado neste contrato");
  }

  private async ensureFeature(contractId: string, moduleId: string, featureId: string): Promise<void> {
    await this.ensureModule(contractId, moduleId);
    const f = await this.prisma.contractFeature.findFirst({ where: { id: featureId, moduleId } });
    if (!f) throw new NotFoundException("Funcionalidade não encontrada neste módulo");
  }

  private async ensureService(contractId: string, serviceId: string): Promise<void> {
    const s = await this.prisma.contractService.findFirst({ where: { id: serviceId, contractId } });
    if (!s) throw new NotFoundException("Serviço não encontrado neste contrato");
  }


  private occurrenceInclude() {
    return {
      internalResponsible: { select: LINKED_USER_SELECT },
      events: { orderBy: { createdAt: "desc" as const }, take: 50 },
      controladoriaCases: { orderBy: { createdAt: "desc" as const } }
    };
  }

  private normalizeIdList(ids: string[] | undefined | null): string[] {
    return Array.from(new Set((ids ?? []).map((id) => id.trim()).filter(Boolean)));
  }

  private asIdList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  }

  private serializeOccurrenceEvent(event: {
    id: string;
    eventType: string;
    fromStatus: ContractOccurrenceStatus | null;
    toStatus: ContractOccurrenceStatus | null;
    justification: string | null;
    actorId: string | null;
    actorLabel: string | null;
    payload: unknown;
    createdAt: Date;
  }) {
    return {
      id: event.id,
      eventType: event.eventType,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      justification: event.justification,
      actorId: event.actorId,
      actorLabel: event.actorLabel,
      payload: event.payload,
      createdAt: event.createdAt
    };
  }

  private serializeControladoriaCase(row: {
    id: string;
    contractId: string;
    occurrenceId: string;
    status: ContractControladoriaCaseStatus;
    justification: string;
    summary: string;
    suggestedActions: string | null;
    snapshotJson: unknown;
    processNumber: string | null;
    originSystem: string | null;
    processLink: string | null;
    openedAt: Date | null;
    subject: string | null;
    unit: string | null;
    responsiblesText: string | null;
    phase: string | null;
    deadlinesText: string | null;
    decisionsText: string | null;
    penaltiesText: string | null;
    resultText: string | null;
    seiNumber: string | null;
    seiLink: string | null;
    createdAt: Date;
    updatedAt: Date;
    occurrence?: { id: string; title: string; status: ContractOccurrenceStatus; type: ContractOccurrenceType } | null;
  }) {
    return {
      id: row.id,
      contractId: row.contractId,
      occurrenceId: row.occurrenceId,
      status: row.status,
      justification: row.justification,
      summary: row.summary,
      suggestedActions: row.suggestedActions,
      snapshotJson: row.snapshotJson,
      processNumber: row.processNumber,
      originSystem: row.originSystem,
      processLink: row.processLink,
      openedAt: row.openedAt,
      subject: row.subject,
      unit: row.unit,
      responsiblesText: row.responsiblesText,
      phase: row.phase,
      deadlinesText: row.deadlinesText,
      decisionsText: row.decisionsText,
      penaltiesText: row.penaltiesText,
      resultText: row.resultText,
      seiNumber: row.seiNumber,
      seiLink: row.seiLink,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      occurrence: row.occurrence
        ? {
            id: row.occurrence.id,
            title: row.occurrence.title,
            status: row.occurrence.status,
            type: row.occurrence.type
          }
        : undefined
    };
  }

  private serializeOccurrence(row: {
    id: string;
    contractId: string;
    type: ContractOccurrenceType;
    origin: ContractOccurrenceOrigin;
    title: string;
    description: string | null;
    detectionDate: Date;
    linkedPricingItemIds: unknown;
    linkedFeatureIds: unknown;
    linkedMeasurementIds: unknown;
    linkedGlosaIds: unknown;
    linkedScheduleIds: unknown;
    severity: ContractOccurrenceSeverity;
    internalResponsibleUserId: string | null;
    regularizationDeadline: Date | null;
    status: ContractOccurrenceStatus;
    conclusion: string | null;
    evidenceNotes: string | null;
    createdAt: Date;
    updatedAt: Date;
    internalResponsible?: LinkedUserRow | null;
    events?: Array<{
      id: string;
      eventType: string;
      fromStatus: ContractOccurrenceStatus | null;
      toStatus: ContractOccurrenceStatus | null;
      justification: string | null;
      actorId: string | null;
      actorLabel: string | null;
      payload: unknown;
      createdAt: Date;
    }>;
    controladoriaCases?: Array<{
      id: string;
      contractId: string;
      occurrenceId: string;
      status: ContractControladoriaCaseStatus;
      justification: string;
      summary: string;
      suggestedActions: string | null;
      snapshotJson: unknown;
      processNumber: string | null;
      originSystem: string | null;
      processLink: string | null;
      openedAt: Date | null;
      subject: string | null;
      unit: string | null;
      responsiblesText: string | null;
      phase: string | null;
      deadlinesText: string | null;
      decisionsText: string | null;
      penaltiesText: string | null;
      resultText: string | null;
      seiNumber: string | null;
      seiLink: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }) {
    const internalResponsible = row.internalResponsible
      ? serializeLinkedUser(row.internalResponsible)
      : null;
    return {
      id: row.id,
      contractId: row.contractId,
      type: row.type,
      origin: row.origin,
      title: row.title,
      description: row.description,
      detectionDate: row.detectionDate,
      linkedPricingItemIds: this.asIdList(row.linkedPricingItemIds),
      linkedFeatureIds: this.asIdList(row.linkedFeatureIds),
      linkedMeasurementIds: this.asIdList(row.linkedMeasurementIds),
      linkedGlosaIds: this.asIdList(row.linkedGlosaIds),
      linkedScheduleIds: this.asIdList(row.linkedScheduleIds),
      severity: row.severity,
      internalResponsibleUserId: row.internalResponsibleUserId,
      internalResponsible,
      regularizationDeadline: row.regularizationDeadline,
      status: row.status,
      conclusion: row.conclusion,
      evidenceNotes: row.evidenceNotes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      events: (row.events ?? []).map((e) => this.serializeOccurrenceEvent(e)),
      controladoriaCases: (row.controladoriaCases ?? []).map((c) => this.serializeControladoriaCase(c))
    };
  }

  private parseOccurrenceDate(value: string | null | undefined, fieldLabel: string): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value.trim() === "") return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Data inválida em ${fieldLabel}.`);
    }
    return d;
  }

  private async recordOccurrenceEvent(
    tx: Prisma.TransactionClient | PrismaService,
    data: {
      occurrenceId: string;
      eventType: string;
      fromStatus?: ContractOccurrenceStatus | null;
      toStatus?: ContractOccurrenceStatus | null;
      justification?: string | null;
      payload?: unknown;
    }
  ): Promise<void> {
    await tx.contractOccurrenceEvent.create({
      data: {
        occurrenceId: data.occurrenceId,
        eventType: data.eventType,
        fromStatus: data.fromStatus ?? null,
        toStatus: data.toStatus ?? null,
        justification: data.justification?.trim() || null,
        actorId: getAuditActorId() === "system" ? null : getAuditActorId(),
        actorLabel: getAuditActorLabel(),
        payload: data.payload != null ? (data.payload as Prisma.InputJsonValue) : undefined
      }
    });
  }

  async listOccurrences(contractId: string): Promise<unknown> {
    await this.ensureContract(contractId);
    const rows = await this.prisma.contractOccurrence.findMany({
      where: { contractId },
      include: this.occurrenceInclude(),
      orderBy: [{ detectionDate: "desc" }, { createdAt: "desc" }]
    });
    return rows.map((r) => this.serializeOccurrence(r));
  }

  async createOccurrence(contractId: string, dto: CreateContractOccurrenceDto): Promise<unknown> {
    await this.ensureContract(contractId);
    const title = dto.title.trim();
    if (!title) throw new BadRequestException("Informe o título da ocorrência.");
    const detectionDate = this.parseOccurrenceDate(dto.detectionDate, "data da constatação");
    if (!detectionDate) throw new BadRequestException("Informe a data da constatação.");
    const responsibleId = dto.internalResponsibleUserId?.trim() || null;
    if (responsibleId) await this.ensureUsersExist([responsibleId]);
    const status = dto.status ?? ContractOccurrenceStatus.EM_ANALISE;
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.contractOccurrence.create({
        data: {
          contractId,
          type: dto.type,
          origin: dto.origin,
          title,
          description: dto.description?.trim() || null,
          detectionDate,
          linkedPricingItemIds: this.normalizeIdList(dto.linkedPricingItemIds),
          linkedFeatureIds: this.normalizeIdList(dto.linkedFeatureIds),
          linkedMeasurementIds: this.normalizeIdList(dto.linkedMeasurementIds),
          linkedGlosaIds: this.normalizeIdList(dto.linkedGlosaIds),
          linkedScheduleIds: this.normalizeIdList(dto.linkedScheduleIds),
          severity: dto.severity ?? ContractOccurrenceSeverity.MEDIA,
          internalResponsibleUserId: responsibleId,
          regularizationDeadline:
            this.parseOccurrenceDate(dto.regularizationDeadline, "prazo de regularização") ?? null,
          status,
          conclusion: dto.conclusion?.trim() || null,
          evidenceNotes: dto.evidenceNotes?.trim() || null
        }
      });
      await this.recordOccurrenceEvent(tx, {
        occurrenceId: row.id,
        eventType: "CREATE",
        toStatus: status,
        payload: { title }
      });
      return tx.contractOccurrence.findUniqueOrThrow({
        where: { id: row.id },
        include: this.occurrenceInclude()
      });
    });
    const serialized = this.serializeOccurrence(created);
    await this.createAudit("ContractOccurrence", created.id, "CREATE", null, serialized);
    return this.findOne(contractId);
  }

  async updateOccurrence(
    contractId: string,
    occurrenceId: string,
    dto: UpdateContractOccurrenceDto
  ): Promise<unknown> {
    const prev = await this.prisma.contractOccurrence.findFirst({
      where: { id: occurrenceId, contractId },
      include: this.occurrenceInclude()
    });
    if (!prev) throw new NotFoundException("Ocorrência não encontrada neste contrato.");
    if (
      prev.status === ContractOccurrenceStatus.ARQUIVADA ||
      prev.status === ContractOccurrenceStatus.CONCLUIDA
    ) {
      throw new BadRequestException("Ocorrência concluída ou arquivada não pode ser editada. Altere a situação antes.");
    }
    const nextResponsible =
      dto.internalResponsibleUserId !== undefined
        ? dto.internalResponsibleUserId?.trim() || null
        : undefined;
    if (nextResponsible) await this.ensureUsersExist([nextResponsible]);
    const title = dto.title !== undefined ? dto.title.trim() : undefined;
    if (title !== undefined && !title) throw new BadRequestException("Informe o título da ocorrência.");
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.contractOccurrence.update({
        where: { id: occurrenceId },
        data: {
          type: dto.type ?? undefined,
          origin: dto.origin ?? undefined,
          title,
          description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
          detectionDate:
            dto.detectionDate !== undefined
              ? this.parseOccurrenceDate(dto.detectionDate, "data da constatação") ?? undefined
              : undefined,
          linkedPricingItemIds:
            dto.linkedPricingItemIds !== undefined
              ? this.normalizeIdList(dto.linkedPricingItemIds)
              : undefined,
          linkedFeatureIds:
            dto.linkedFeatureIds !== undefined ? this.normalizeIdList(dto.linkedFeatureIds) : undefined,
          linkedMeasurementIds:
            dto.linkedMeasurementIds !== undefined
              ? this.normalizeIdList(dto.linkedMeasurementIds)
              : undefined,
          linkedGlosaIds:
            dto.linkedGlosaIds !== undefined ? this.normalizeIdList(dto.linkedGlosaIds) : undefined,
          linkedScheduleIds:
            dto.linkedScheduleIds !== undefined ? this.normalizeIdList(dto.linkedScheduleIds) : undefined,
          severity: dto.severity ?? undefined,
          internalResponsibleUserId: nextResponsible,
          regularizationDeadline:
            dto.regularizationDeadline !== undefined
              ? this.parseOccurrenceDate(dto.regularizationDeadline, "prazo de regularização") ?? null
              : undefined,
          conclusion: dto.conclusion !== undefined ? dto.conclusion?.trim() || null : undefined,
          evidenceNotes: dto.evidenceNotes !== undefined ? dto.evidenceNotes?.trim() || null : undefined
        }
      });
      await this.recordOccurrenceEvent(tx, {
        occurrenceId,
        eventType: "UPDATE",
        fromStatus: prev.status,
        toStatus: prev.status,
        payload: { fields: Object.keys(dto) }
      });
      return tx.contractOccurrence.findUniqueOrThrow({
        where: { id: occurrenceId },
        include: this.occurrenceInclude()
      });
    });
    await this.createAudit(
      "ContractOccurrence",
      occurrenceId,
      "UPDATE",
      this.serializeOccurrence(prev),
      this.serializeOccurrence(updated)
    );
    return this.findOne(contractId);
  }

  async changeOccurrenceStatus(
    contractId: string,
    occurrenceId: string,
    dto: ChangeContractOccurrenceStatusDto
  ): Promise<unknown> {
    const prev = await this.prisma.contractOccurrence.findFirst({
      where: { id: occurrenceId, contractId },
      include: this.occurrenceInclude()
    });
    if (!prev) throw new NotFoundException("Ocorrência não encontrada neste contrato.");
    const justification = dto.justification.trim();
    if (justification.length < 3) {
      throw new BadRequestException("Informe a justificativa da mudança de situação (mínimo 3 caracteres).");
    }
    if (dto.status === prev.status) {
      throw new BadRequestException("A nova situação é igual à atual.");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.contractOccurrence.update({
        where: { id: occurrenceId },
        data: { status: dto.status }
      });
      await this.recordOccurrenceEvent(tx, {
        occurrenceId,
        eventType: "STATUS_CHANGE",
        fromStatus: prev.status,
        toStatus: dto.status,
        justification
      });
      return tx.contractOccurrence.findUniqueOrThrow({
        where: { id: occurrenceId },
        include: this.occurrenceInclude()
      });
    });
    await this.createAudit(
      "ContractOccurrence",
      occurrenceId,
      "STATUS_CHANGE",
      { status: prev.status },
      { status: updated.status, justification }
    );
    return this.findOne(contractId);
  }

  async deleteOccurrence(contractId: string, occurrenceId: string): Promise<unknown> {
    const prev = await this.prisma.contractOccurrence.findFirst({
      where: { id: occurrenceId, contractId },
      include: this.occurrenceInclude()
    });
    if (!prev) throw new NotFoundException("Ocorrência não encontrada neste contrato.");
    const caseCount = await this.prisma.contractControladoriaCase.count({
      where: { occurrenceId }
    });
    if (caseCount > 0) {
      throw new BadRequestException(
        "Não é possível excluir ocorrência com dossiê na Controladoria. Arquive a ocorrência ou atualize o caso."
      );
    }
    await this.prisma.contractOccurrence.delete({ where: { id: occurrenceId } });
    await this.createAudit("ContractOccurrence", occurrenceId, "DELETE", this.serializeOccurrence(prev), null);
    return this.findOne(contractId);
  }

  async listControladoriaCases(contractId: string): Promise<unknown> {
    await this.ensureContract(contractId);
    const rows = await this.prisma.contractControladoriaCase.findMany({
      where: { contractId },
      include: {
        occurrence: { select: { id: true, title: true, status: true, type: true } }
      },
      orderBy: [{ createdAt: "desc" }]
    });
    return rows.map((r) => this.serializeControladoriaCase(r));
  }

  async listAllControladoriaCases(take = 100): Promise<unknown> {
    const limit = Number.isFinite(take) ? Math.min(Math.max(Math.trunc(take), 1), 500) : 100;
    const rows = await this.prisma.contractControladoriaCase.findMany({
      where: { contract: await this.accessibleContractWhereList() },
      include: {
        occurrence: { select: { id: true, title: true, status: true, type: true } },
        contract: {
          select: {
            id: true,
            number: true,
            name: true,
            internalCode: true,
            companyName: true
          }
        }
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit
    });
    return rows.map((r) => ({
      ...this.serializeControladoriaCase(r),
      contract: r.contract
    }));
  }

  private async accessibleContractWhereList(): Promise<Prisma.ContractWhereInput> {
    return { deletedAt: null, ...this.organizationScope() };
  }

  async forwardOccurrenceToControladoria(
    contractId: string,
    occurrenceId: string,
    dto: ForwardOccurrenceToControladoriaDto
  ): Promise<unknown> {
    const occurrence = await this.prisma.contractOccurrence.findFirst({
      where: { id: occurrenceId, contractId },
      include: this.occurrenceInclude()
    });
    if (!occurrence) throw new NotFoundException("Ocorrência não encontrada neste contrato.");
    const justification = dto.justification.trim();
    const summary = dto.summary.trim();
    if (justification.length < 3 || summary.length < 3) {
      throw new BadRequestException("Justificativa e resumo são obrigatórios (mínimo 3 caracteres).");
    }
    const contract = await this.prisma.contract.findFirst({
      where: await this.accessibleContractWhere(contractId),
      select: {
        id: true,
        number: true,
        formalNumber: true,
        contractYear: true,
        internalCode: true,
        administrativeProcess: true,
        name: true,
        companyName: true,
        cnpj: true,
        status: true,
        organizationId: true,
        managingUnit: true,
        startDate: true,
        endDate: true,
        totalValue: true,
        monthlyValue: true
      }
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado");
    const snapshot = {
      generatedAt: new Date().toISOString(),
      contract,
      occurrence: this.serializeOccurrence(occurrence),
      forward: {
        justification,
        summary,
        suggestedActions: dto.suggestedActions?.trim() || null
      }
    };
    const created = await this.prisma.$transaction(async (tx) => {
      const caseRow = await tx.contractControladoriaCase.create({
        data: {
          contractId,
          occurrenceId,
          status: ContractControladoriaCaseStatus.ENCAMINHADO,
          justification,
          summary,
          suggestedActions: dto.suggestedActions?.trim() || null,
          snapshotJson: snapshot as Prisma.InputJsonValue,
          openedAt: new Date()
        },
        include: {
          occurrence: { select: { id: true, title: true, status: true, type: true } }
        }
      });
      const nextStatus =
        occurrence.status === ContractOccurrenceStatus.ENCAMINHADA_CONTROLADORIA ||
        occurrence.status === ContractOccurrenceStatus.EM_PROCESSO_ADMINISTRATIVO
          ? occurrence.status
          : ContractOccurrenceStatus.ENCAMINHADA_CONTROLADORIA;
      if (nextStatus !== occurrence.status) {
        await tx.contractOccurrence.update({
          where: { id: occurrenceId },
          data: { status: nextStatus }
        });
      }
      await this.recordOccurrenceEvent(tx, {
        occurrenceId,
        eventType: "FORWARD_CONTROLADORIA",
        fromStatus: occurrence.status,
        toStatus: nextStatus,
        justification,
        payload: { caseId: caseRow.id, summary }
      });
      return caseRow;
    });
    const serialized = this.serializeControladoriaCase(created);
    await this.createAudit("ContractControladoriaCase", created.id, "FORWARD_CONTROLADORIA", null, {
      ...serialized,
      snapshotJson: undefined
    });
    return this.findOne(contractId);
  }

  async updateControladoriaCase(
    contractId: string,
    caseId: string,
    dto: UpdateContractControladoriaCaseDto
  ): Promise<unknown> {
    const prev = await this.prisma.contractControladoriaCase.findFirst({
      where: { id: caseId, contractId },
      include: {
        occurrence: { select: { id: true, title: true, status: true, type: true } }
      }
    });
    if (!prev) throw new NotFoundException("Caso da Controladoria não encontrado neste contrato.");
    const updated = await this.prisma.contractControladoriaCase.update({
      where: { id: caseId },
      data: {
        status: dto.status ?? undefined,
        processNumber: dto.processNumber !== undefined ? dto.processNumber?.trim() || null : undefined,
        originSystem: dto.originSystem !== undefined ? dto.originSystem?.trim() || null : undefined,
        processLink: dto.processLink !== undefined ? dto.processLink?.trim() || null : undefined,
        openedAt:
          dto.openedAt !== undefined
            ? this.parseOccurrenceDate(dto.openedAt, "data de abertura") ?? null
            : undefined,
        subject: dto.subject !== undefined ? dto.subject?.trim() || null : undefined,
        unit: dto.unit !== undefined ? dto.unit?.trim() || null : undefined,
        responsiblesText:
          dto.responsiblesText !== undefined ? dto.responsiblesText?.trim() || null : undefined,
        phase: dto.phase !== undefined ? dto.phase?.trim() || null : undefined,
        deadlinesText: dto.deadlinesText !== undefined ? dto.deadlinesText?.trim() || null : undefined,
        decisionsText: dto.decisionsText !== undefined ? dto.decisionsText?.trim() || null : undefined,
        penaltiesText: dto.penaltiesText !== undefined ? dto.penaltiesText?.trim() || null : undefined,
        resultText: dto.resultText !== undefined ? dto.resultText?.trim() || null : undefined,
        seiNumber: dto.seiNumber !== undefined ? dto.seiNumber?.trim() || null : undefined,
        seiLink: dto.seiLink !== undefined ? dto.seiLink?.trim() || null : undefined
      },
      include: {
        occurrence: { select: { id: true, title: true, status: true, type: true } }
      }
    });
    await this.createAudit(
      "ContractControladoriaCase",
      caseId,
      "UPDATE",
      this.serializeControladoriaCase(prev),
      this.serializeControladoriaCase(updated)
    );
    return this.findOne(contractId);
  }

  private async createAudit(entity: string, entityId: string, action: string, oldData: unknown, newData: unknown): Promise<void> {
    const gate = await resolveAuditGate(this.prisma, entity, action);
    if (!gate.enabled) return;
    const trimmedOld = applyAuditDetailLevel(gate.detailLevel, oldData);
    const trimmedNew = applyAuditDetailLevel(gate.detailLevel, newData);
    await this.prisma.auditLog.create({
      data: {
        entity,
        entityId,
        action,
        userId: getAuditActorId(),
        oldData: trimmedOld != null ? (trimmedOld as Prisma.InputJsonValue) : undefined,
        newData: trimmedNew != null ? (trimmedNew as Prisma.InputJsonValue) : undefined
      }
    });
    await this.createOperationalEvent(entity, entityId, action, oldData, newData);
  }

  private async createContractItemChangeLog(input: {
    contractId: string;
    itemType: ContractItemChangeType;
    itemId?: string | null;
    itemName: string;
    action: ContractItemChangeAction;
    criticalityBefore?: string | null;
    criticalityAfter?: string | null;
    statusBefore?: string | null;
    statusAfter?: string | null;
    deliveryStatusBefore?: string | null;
    deliveryStatusAfter?: string | null;
    oldData?: unknown;
    newData?: unknown;
  }): Promise<void> {
    await this.prisma.contractItemChangeLog.create({
      data: {
        contractId: input.contractId,
        itemType: input.itemType,
        itemId: input.itemId ?? null,
        itemName: input.itemName,
        action: input.action,
        criticalityBefore: input.criticalityBefore ?? null,
        criticalityAfter: input.criticalityAfter ?? null,
        statusBefore: input.statusBefore ?? null,
        statusAfter: input.statusAfter ?? null,
        deliveryStatusBefore: input.deliveryStatusBefore ?? null,
        deliveryStatusAfter: input.deliveryStatusAfter ?? null,
        actorId: getAuditActorId(),
        actorLabel: getAuditActorLabel(),
        oldData: input.oldData ? (input.oldData as Prisma.InputJsonValue) : undefined,
        newData: input.newData ? (input.newData as Prisma.InputJsonValue) : undefined
      }
    });
  }

  private async createOperationalEvent(
    entity: string,
    entityId: string,
    action: string,
    oldData: unknown,
    newData: unknown
  ): Promise<void> {
    const oldRecord = oldData && typeof oldData === "object" ? (oldData as Record<string, unknown>) : {};
    const newRecord = newData && typeof newData === "object" ? (newData as Record<string, unknown>) : {};
    const name = String(newRecord.name ?? oldRecord.name ?? newRecord.number ?? oldRecord.number ?? entityId);
    const title =
      entity === "ContractFeature" && action === "UPDATE"
        ? `Funcionalidade alterada: ${name}`
        : entity === "Contract" && action === "UPDATE"
          ? `Contrato alterado: ${name}`
          : entity === "Contract" && action === "CREATE"
            ? `Contrato criado: ${name}`
            : entity === "Contract" && action === "AMEND"
              ? `Aditivo registrado no contrato ${name}`
              : `${entity} ${action.toLowerCase()}: ${name}`;
    const statusBefore = oldRecord.status != null ? String(oldRecord.status) : null;
    const statusAfter = newRecord.status != null ? String(newRecord.status) : null;
    const deliveryBefore = oldRecord.deliveryStatus != null ? String(oldRecord.deliveryStatus) : null;
    const deliveryAfter = newRecord.deliveryStatus != null ? String(newRecord.deliveryStatus) : null;
    const descriptionParts = [
      statusBefore !== statusAfter && statusAfter ? `Status: ${statusBefore ?? "sem status"} → ${statusAfter}` : null,
      deliveryBefore !== deliveryAfter && deliveryAfter
        ? `Entrega: ${deliveryBefore ?? "sem status"} → ${deliveryAfter}`
        : null
    ].filter((part): part is string => Boolean(part));

    await this.prisma.operationalEvent.create({
      data: {
        type: `CONTRACT_${action}`,
        category: "CONTRACTS",
        entity,
        entityId,
        title,
        description: descriptionParts.join(" · ") || null,
        actorId: getAuditActorId(),
        actorLabel: getAuditActorLabel(),
        metadata: {
          action,
          statusBefore,
          statusAfter,
          deliveryBefore,
          deliveryAfter
        }
      }
    });
  }
}
