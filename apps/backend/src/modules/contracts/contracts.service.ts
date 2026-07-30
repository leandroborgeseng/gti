import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId, getAuditActorLabel, requestActorStore } from "../../common/audit-actor";
import {
  ContractFeatureStatus,
  ContractItemChangeAction,
  ContractItemChangeType,
  ContractItemCriticality,
  ContractItemDeliveryStatus,
  ContractPricingItemStatus,
  ContractStatus,
  ContractType,
  LawType,
  Prisma
} from "@prisma/client";
import { compareItemCodes, sortFeaturesByItemCode } from "../../common/item-code-order";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateContractAmendmentDto,
  CreateContractDto,
  CreateContractFeatureDto,
  CreateContractFinancialSnapshotDto,
  CreateContractModuleDto,
  CreateContractServiceDto,
  ContractGlpiGroupLinkDto,
  ContractStructureImportRow,
  DeleteContractDto,
  PricingItemDto,
  UpdateContractDto,
  UpdateContractFeatureDto,
  UpdateContractModuleDto,
  UpdateContractServiceDto
} from "./contracts.dto";
import { ContractPricingHelper, type PricingItemInput } from "./contract-pricing.helper";
import {
  PricingItemsFinancialReportService,
  type PricingItemsFinancialReportQuery
} from "../reports/pricing-items-financial-report.service";

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

function featureDisplayName(itemCode: string | null | undefined, name: string): string {
  const code = itemCode?.trim();
  return code ? `${code} — ${name}` : name;
}

function sortModuleListFeatures<T extends { features: Array<{ itemCode?: string | null; name?: string }> }>(modules: T[]): T[] {
  return modules.map((module) => ({
    ...module,
    features: sortFeaturesByItemCode(module.features)
  }));
}

const CRITICALITY_SCORE: Record<ContractItemCriticality, number> = {
  CRITICA: 5,
  ALTA: 4,
  MEDIA: 3,
  BAIXA: 2,
  APOIO: 1
};

function criticalityScore(value: ContractItemCriticality | null | undefined): number {
  return CRITICALITY_SCORE[value ?? ContractItemCriticality.MEDIA] ?? CRITICALITY_SCORE.MEDIA;
}

export type BillingPhase = "UNDEFINED" | "PRE_IMPLEMENTATION" | "IMPLEMENTATION" | "MONTHLY";

export type FeatureImplantationProportionDto = {
  applicable: boolean;
  totalFeatures: number;
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

type ImplantationModulesInput = Array<{ features: Array<{ deliveryStatus: ContractItemDeliveryStatus }> }>;

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
  implantedCount: number;
  partialCount: number;
  notDeliveredCount: number;
  at: Date;
}): FeatureImplantationProportionDto {
  const { totalFeatures, implantedCount, partialCount, notDeliveredCount } = ctx;
  return finishFeatureImplantationProportion({
    ...ctx,
    totalFeatures,
    implantedCount,
    partialCount,
    notDeliveredCount
  });
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
  let implantedCount = 0;
  let partialCount = 0;
  let notDeliveredCount = 0;
  for (const m of ctx.modules) {
    for (const f of m.features) {
      totalFeatures++;
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
  implantedCount: number;
  partialCount: number;
  notDeliveredCount: number;
  at: Date;
}): FeatureImplantationProportionDto {
  const { totalFeatures, implantedCount, partialCount, notDeliveredCount } = ctx;
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
  const half = new Prisma.Decimal("0.5");
  const weightedDelivered = new Prisma.Decimal(implantedCount).plus(new Prisma.Decimal(partialCount).mul(half));
  const ratioDec = weightedDelivered.div(new Prisma.Decimal(totalFeatures));
  const proportionalMonthly = monthly.mul(ratioDec).toDecimalPlaces(2);
  const proportionalInstallation =
    instDec != null ? instDec.mul(ratioDec).toDecimalPlaces(2) : null;
  const ratioNum = Number(ratioDec.toString());
  return {
    applicable: true,
    totalFeatures,
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

  constructor(private readonly prisma: PrismaService) {
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

  async findModuleValidators(): Promise<Array<{ id: string; email: string; role: string }>> {
    return this.prisma.user.findMany({
      where: { approvalStatus: "APPROVED" },
      orderBy: { email: "asc" },
      select: { id: true, email: true, role: true }
    });
  }

  /**
   * Resumo dos contratos com estrutura modular (sem carregar funcionalidades).
   * Totais de entrega vêm de agregação no banco.
   */
  async findModulesDeliveryOverview(): Promise<unknown> {
    const rows = await this.prisma.contract.findMany({
      where: {
        deletedAt: null,
        contractType: { in: [ContractType.SOFTWARE, ContractType.INFRA, ContractType.SERVICO] }
      },
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

    const contractIds = rows.map((r) => r.id);
    const modules = await this.prisma.contractModule.findMany({
      where: { contractId: { in: contractIds } },
      select: { id: true, contractId: true }
    });
    const moduleIds = modules.map((m) => m.id);
    const moduleToContract = new Map(modules.map((m) => [m.id, m.contractId]));

    const grouped =
      moduleIds.length === 0
        ? []
        : await this.prisma.contractFeature.groupBy({
            by: ["moduleId", "deliveryStatus"],
            where: { moduleId: { in: moduleIds } },
            _count: { _all: true }
          });

    const countsByContract = new Map<
      string,
      { total: number; delivered: number; partial: number; notDelivered: number }
    >();
    for (const id of contractIds) {
      countsByContract.set(id, { total: 0, delivered: 0, partial: 0, notDelivered: 0 });
    }
    for (const g of grouped) {
      const contractId = moduleToContract.get(g.moduleId);
      if (!contractId) continue;
      const bucket = countsByContract.get(contractId);
      if (!bucket) continue;
      const n = g._count._all;
      bucket.total += n;
      if (g.deliveryStatus === ContractItemDeliveryStatus.DELIVERED) bucket.delivered += n;
      else if (g.deliveryStatus === ContractItemDeliveryStatus.PARTIALLY_DELIVERED) bucket.partial += n;
      else bucket.notDelivered += n;
    }

    return rows.map((row) => {
      const c = countsByContract.get(row.id) ?? { total: 0, delivered: 0, partial: 0, notDelivered: 0 };
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
    const modules = await this.prisma.contractModule.findMany({
      where: { contractId },
      select: {
        id: true,
        name: true,
        criticality: true,
        validatorId: true,
        validator: { select: { id: true, email: true, role: true } },
        glosaPricingItemId: true,
        glosaPricingItem: { select: { id: true, sequence: true, description: true } },
        weight: true
      },
      orderBy: { name: "asc" }
    });
    if (modules.length === 0) return { contractId, modules: [] };

    const moduleIds = modules.map((m) => m.id);
    const grouped = await this.prisma.contractFeature.groupBy({
      by: ["moduleId", "deliveryStatus"],
      where: { moduleId: { in: moduleIds } },
      _count: { _all: true }
    });
    const byModule = new Map<string, { total: number; delivered: number; partial: number; notDelivered: number }>();
    for (const id of moduleIds) {
      byModule.set(id, { total: 0, delivered: 0, partial: 0, notDelivered: 0 });
    }
    for (const g of grouped) {
      const bucket = byModule.get(g.moduleId);
      if (!bucket) continue;
      const n = g._count._all;
      bucket.total += n;
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
    }
  ): Promise<unknown> {
    await this.ensureModule(contractId, moduleId);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 40));
    const where = this.buildFeatureDeliveryWhere(moduleId, query);

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
          deliveryStatus: true
        },
        orderBy: [{ itemCode: "asc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    const ordered = sortFeaturesByItemCode(features);
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
    pageSize?: number;
  }): Promise<unknown> {
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 40));
    const q = (query.q ?? "").trim();
    const deliveryStatus = query.deliveryStatus?.trim() || undefined;
    const criticality = query.criticality?.trim() || undefined;
    if (!q && !deliveryStatus && !criticality) {
      return { contracts: [], totalFeatures: 0 };
    }

    const featureWhere: Prisma.ContractFeatureWhereInput = {
      module: {
        contract: {
          deletedAt: null,
          contractType: { in: [ContractType.SOFTWARE, ContractType.INFRA, ContractType.SERVICO] }
        }
      }
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
      take: 2000
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
    return this.prisma.contract.findMany({
      where: { deletedAt: null, ...this.organizationScope() },
      include: {
        fiscal: true,
        manager: true,
        supplier: true,
        glpiGroups: { orderBy: { glpiGroupName: "asc" } },
        _count: { select: { amendments: true } }
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

  async findOne(id: string): Promise<unknown> {
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null, ...this.organizationScope() },
      include: {
        modules: {
          include: {
            features: true,
            validator: { select: { id: true, email: true, role: true } },
            glosaPricingItem: { include: { type: true } }
          }
        },
        services: true,
        fiscal: true,
        manager: true,
        supplier: true,
        glpiGroups: { orderBy: { glpiGroupName: "asc" } },
        amendments: { orderBy: { createdAt: "desc" } },
        financialSnapshots: { orderBy: { recordedAt: "desc" }, take: 50 },
        itemChangeLogs: { orderBy: { changedAt: "desc" }, take: 100 },
        pricingItems: {
          include: { type: true, unit: true },
          orderBy: { sequence: "asc" }
        }
      }
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado");
    const modules = sortModuleListFeatures(contract.modules);
    const { summarizePricingItems } = await import("./contract-pricing.helper");
    const pricingTotals = summarizePricingItems(contract.pricingItems);
    const pricingLocked = await this.pricing.contractHasMovements(id);
    return {
      ...contract,
      modules,
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
   * Registra um aditivo/reajuste (histórico) e aplica imediatamente valor total, valor mensal e data de término no contrato.
   */
  async createAmendment(contractId: string, dto: CreateContractAmendmentDto): Promise<unknown> {
    const prev = await this.prisma.contract.findFirst({
      where: { id: contractId, deletedAt: null },
      include: { modules: { include: { features: true } }, services: true, fiscal: true, manager: true, supplier: true }
    });
    if (!prev) throw new NotFoundException("Contrato não encontrado");
    if (prev.status !== ContractStatus.ACTIVE) {
      throw new BadRequestException("Só é possível registrar aditivos para contratos em estado «Ativo».");
    }

    const newEnd = new Date(dto.newEndDate);
    const effectiveDate = new Date(dto.effectiveDate);
    if (Number.isNaN(newEnd.getTime()) || Number.isNaN(effectiveDate.getTime())) {
      throw new BadRequestException("Datas inválidas.");
    }
    if (newEnd < prev.startDate) {
      throw new BadRequestException("A nova data de término não pode ser anterior à data de início do contrato.");
    }

    const newTotal = new Prisma.Decimal(dto.newTotalValue);
    const newMonthly = new Prisma.Decimal(dto.newMonthlyValue);
    if (newTotal.lt(0) || newMonthly.lt(0)) {
      throw new BadRequestException("Valores não podem ser negativos.");
    }

    const { created, updatedContract } = await this.prisma.$transaction(async (tx) => {
      const ref = dto.referenceCode?.trim();
      const createdAmendment = await tx.contractAmendment.create({
        data: {
          contractId,
          referenceCode: ref ? ref : null,
          effectiveDate,
          description: dto.description.trim(),
          previousTotalValue: prev.totalValue,
          previousMonthlyValue: prev.monthlyValue,
          previousEndDate: prev.endDate,
          newTotalValue: newTotal,
          newMonthlyValue: newMonthly,
          newEndDate: newEnd
        }
      });
      const updated = await tx.contract.update({
        where: { id: contractId },
        data: {
          totalValue: newTotal,
          monthlyValue: newMonthly,
          endDate: newEnd
        },
        include: { modules: { include: { features: true } }, services: true, fiscal: true, manager: true, supplier: true }
      });
      return { created: createdAmendment, updatedContract: updated };
    });

    await this.createAudit("ContractAmendment", created.id, "CREATE", null, created);
    await this.createAudit("Contract", contractId, "AMEND", prev, updatedContract);
    return this.findOne(contractId);
  }

  /**
   * Grava na memória os valores financeiros atuais do contrato (mensal, total, implantação),
   * para comparar depois de uma renovação ou reajuste manual.
   */
  async createFinancialSnapshot(contractId: string, dto: CreateContractFinancialSnapshotDto): Promise<unknown> {
    const prev = await this.prisma.contract.findFirst({ where: { id: contractId, deletedAt: null } });
    if (!prev) throw new NotFoundException("Contrato não encontrado");
    const note = dto.note?.trim();
    const created = await this.prisma.contractFinancialSnapshot.create({
      data: {
        contractId,
        monthlyValue: prev.monthlyValue,
        totalValue: prev.totalValue,
        installationValue: prev.installationValue,
        note: note ? note : null
      }
    });
    await this.createAudit("ContractFinancialSnapshot", created.id, "CREATE", null, created);
    return this.findOne(contractId);
  }

  async update(id: string, dto: UpdateContractDto): Promise<unknown> {
    const prev = await this.prisma.contract.findFirst({ where: { id, deletedAt: null } });
    if (!prev) throw new NotFoundException("Contrato não encontrado");
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
      snapshots,
      governance,
      evaluatedFeatures,
      statusChangeLogs,
      consumedPricing
    ] = await Promise.all([
      this.prisma.measurement.count({ where: { contractId, deletedAt: null } }),
      this.prisma.contractAmendment.count({ where: { contractId } }),
      this.prisma.contractFinancialSnapshot.count({ where: { contractId } }),
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
    if (snapshots > 0) blockers.push(`memória financeira (${snapshots})`);
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
          const featureRows = group.features.map((fr) => ({
            moduleId: mid,
            itemCode: fr.featureCode?.trim() || null,
            name: fr.featureName.trim(),
            criticality: fr.featureCriticality ?? ContractItemCriticality.MEDIA,
            weight: new Prisma.Decimal(fr.featureWeight ?? 0),
            status: fr.featureStatus ?? ContractFeatureStatus.NOT_STARTED,
            deliveryStatus: fr.featureDelivery ?? ContractItemDeliveryStatus.NOT_DELIVERED
          }));
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

    await this.createAudit("Contract", contractId, "IMPORT_STRUCTURE", null, { rows: rows.length, replace: opts.replace });
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.FEATURE,
      itemId: null,
      itemName: "Importação de módulos e funcionalidades",
      action: ContractItemChangeAction.BULK_IMPORTED,
      newData: { rows: rows.length, replace: opts.replace }
    });
    return this.findOne(contractId);
  }

  async createModule(contractId: string, dto: CreateContractModuleDto): Promise<unknown> {
    await this.ensureContract(contractId);
    if (dto.validatorId?.trim()) {
      await this.ensureUser(dto.validatorId.trim());
    }
    const glosaPricingItemId = await this.resolveModuleGlosaPricingItemId(contractId, dto.glosaPricingItemId);
    const created = await this.prisma.contractModule.create({
      data: {
        contractId,
        name: dto.name,
        criticality: dto.criticality ?? ContractItemCriticality.MEDIA,
        validatorId: dto.validatorId?.trim() || null,
        glosaPricingItemId,
        weight: new Prisma.Decimal(dto.weight ?? 0)
      }
    });
    await this.recalculateContractModuleWeights(contractId);
    const recalculated = await this.prisma.contractModule.findUnique({ where: { id: created.id } });
    await this.createAudit("ContractModule", created.id, "CREATE", null, created);
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.MODULE,
      itemId: created.id,
      itemName: recalculated?.name ?? created.name,
      action: ContractItemChangeAction.CREATED,
      criticalityAfter: recalculated?.criticality ?? created.criticality,
      newData: recalculated ?? created
    });
    return this.findOne(contractId);
  }

  async updateModule(contractId: string, moduleId: string, dto: UpdateContractModuleDto): Promise<unknown> {
    await this.ensureModule(contractId, moduleId);
    if (dto.validatorId?.trim()) {
      await this.ensureUser(dto.validatorId.trim());
    }
    const glosaPricingItemId =
      dto.glosaPricingItemId === undefined
        ? undefined
        : await this.resolveModuleGlosaPricingItemId(contractId, dto.glosaPricingItemId);
    const prev = await this.prisma.contractModule.findUnique({ where: { id: moduleId } });
    const updated = await this.prisma.contractModule.update({
      where: { id: moduleId },
      data: {
        name: dto.name ?? undefined,
        criticality: dto.criticality ?? undefined,
        validatorId: dto.validatorId === undefined ? undefined : dto.validatorId?.trim() || null,
        glosaPricingItemId,
        weight: dto.weight != null ? new Prisma.Decimal(dto.weight) : undefined
      }
    });
    await this.recalculateContractModuleWeights(contractId);
    const recalculated = await this.prisma.contractModule.findUnique({ where: { id: moduleId } });
    await this.createAudit("ContractModule", moduleId, "UPDATE", prev, recalculated ?? updated);
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.MODULE,
      itemId: moduleId,
      itemName: recalculated?.name ?? updated.name,
      action: ContractItemChangeAction.UPDATED,
      criticalityBefore: prev?.criticality ?? null,
      criticalityAfter: recalculated?.criticality ?? updated.criticality,
      oldData: prev,
      newData: recalculated ?? updated
    });
    return this.findOne(contractId);
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
    return this.findOne(contractId);
  }

  async createFeature(contractId: string, moduleId: string, dto: CreateContractFeatureDto): Promise<unknown> {
    await this.ensureModule(contractId, moduleId);
    const itemCode = dto.itemCode?.trim();
    if (!itemCode) {
      throw new BadRequestException("O campo obrigatório Código do Item deve ser preenchido antes de gravar a informação.");
    }
    const created = await this.prisma.contractFeature.create({
      data: {
        moduleId,
        itemCode,
        name: dto.name,
        criticality: dto.criticality ?? ContractItemCriticality.MEDIA,
        weight: new Prisma.Decimal(dto.weight ?? 0),
        status: dto.status ?? ContractFeatureStatus.NOT_STARTED,
        deliveryStatus: dto.deliveryStatus ?? ContractItemDeliveryStatus.NOT_DELIVERED
      }
    });
    await this.recalculateModuleFeatureWeights(moduleId);
    const recalculated = await this.prisma.contractFeature.findUnique({ where: { id: created.id } });
    await this.createAudit("ContractFeature", created.id, "CREATE", null, recalculated ?? created);
    await this.createContractItemChangeLog({
      contractId,
      itemType: ContractItemChangeType.FEATURE,
      itemId: created.id,
      itemName: featureDisplayName(recalculated?.itemCode ?? created.itemCode, recalculated?.name ?? created.name),
      action: ContractItemChangeAction.CREATED,
      criticalityAfter: recalculated?.criticality ?? created.criticality,
      statusAfter: recalculated?.status ?? created.status,
      deliveryStatusAfter: recalculated?.deliveryStatus ?? created.deliveryStatus,
      newData: recalculated ?? created
    });
    return this.findOne(contractId);
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
    const prev = await this.prisma.contractFeature.findUnique({ where: { id: featureId } });
    const updated = await this.prisma.contractFeature.update({
      where: { id: featureId },
      data: {
        itemCode: dto.itemCode !== undefined ? dto.itemCode.trim() : undefined,
        name: dto.name ?? undefined,
        weight: dto.weight != null ? new Prisma.Decimal(dto.weight) : undefined,
        criticality: dto.criticality ?? undefined,
        status: dto.status ?? undefined,
        deliveryStatus: dto.deliveryStatus ?? undefined
      }
    });
    await this.recalculateModuleFeatureWeights(moduleId);
    const recalculated = await this.prisma.contractFeature.findUnique({ where: { id: featureId } });
    const next = recalculated ?? updated;
    await this.createAudit("ContractFeature", featureId, "UPDATE", prev, next);
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
      oldData: prev,
      newData: {
        ...(next as object),
        changeSource: dto.changeSource?.trim() || "CONTRACT_DETAIL"
      }
    });
    return this.findOne(contractId);
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
    return this.findOne(contractId);
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
    const c = await this.prisma.contract.findFirst({ where: { id: contractId, deletedAt: null } });
    if (!c) throw new NotFoundException("Contrato não encontrado");
  }

  /**
   * Restringe consultas ao órgão do usuário, sem bloquear contas legadas
   * que ainda não tenham órgão definido.
   */
  private organizationScope(): Prisma.ContractWhereInput {
    const actor = requestActorStore.getStore();
    if (actor?.role !== "ADMIN" && actor?.organizationId) {
      return { organizationId: actor.organizationId };
    }
    return {};
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
    if (total <= 0) return;
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

  private async createAudit(entity: string, entityId: string, action: string, oldData: unknown, newData: unknown): Promise<void> {
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
