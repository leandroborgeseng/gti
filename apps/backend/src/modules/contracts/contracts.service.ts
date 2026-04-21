import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId } from "../../common/audit-actor";
import { ContractFeatureStatus, ContractItemDeliveryStatus, ContractStatus, ContractType, LawType, Prisma } from "@prisma/client";
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
  UpdateContractDto,
  UpdateContractFeatureDto,
  UpdateContractModuleDto,
  UpdateContractServiceDto
} from "./contracts.dto";

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

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateContractDto): Promise<unknown> {
    const { glpiGroups, ...rest } = dto;
    const totalValue = rest.totalValue ?? rest.monthlyValue * 12;
    const managerId = rest.managerId ?? rest.fiscalId;
    const implStart = rest.implementationPeriodStart ? new Date(rest.implementationPeriodStart) : null;
    const implEnd = rest.implementationPeriodEnd ? new Date(rest.implementationPeriodEnd) : null;
    assertImplementationPeriodOrder(implStart, implEnd);
    const created = await this.prisma.contract.create({
      data: {
        number: rest.number,
        name: rest.name,
        description: rest.description,
        managingUnit: rest.managingUnit,
        companyName: rest.companyName,
        cnpj: rest.cnpj,
        contractType: rest.contractType,
        lawType: rest.lawType ?? LawType.LEI_14133,
        startDate: new Date(rest.startDate),
        endDate: new Date(rest.endDate),
        totalValue: new Prisma.Decimal(totalValue),
        monthlyValue: new Prisma.Decimal(rest.monthlyValue),
        installationValue:
          rest.installationValue === undefined || rest.installationValue === null
            ? null
            : new Prisma.Decimal(rest.installationValue),
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
    await this.createAudit("Contract", created.id, "CREATE", null, created);
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
   * Contratos com estrutura de módulos (Software / Infra / Serviço) e itens com estado de entrega,
   * para a página global «Módulos».
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
        modules: {
          select: {
            id: true,
            name: true,
            weight: true,
            features: {
              select: {
                id: true,
                name: true,
                weight: true,
                status: true,
                deliveryStatus: true
              },
              orderBy: { name: "asc" }
            }
          },
          orderBy: { name: "asc" }
        }
      },
      orderBy: { number: "asc" }
    });
    return rows.map((row) => ({
      ...row,
      featureImplantationProportion: buildFeatureImplantationProportion({
        monthlyValue: row.monthlyValue,
        installationValue: row.installationValue ?? null,
        implementationPeriodStart: row.implementationPeriodStart ?? null,
        implementationPeriodEnd: row.implementationPeriodEnd ?? null,
        modules: row.modules,
        at: new Date()
      })
    }));
  }

  async findAll(): Promise<unknown> {
    return this.prisma.contract.findMany({
      where: { deletedAt: null },
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

  async findOne(id: string): Promise<unknown> {
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null },
      include: {
        modules: { include: { features: true } },
        services: true,
        fiscal: true,
        manager: true,
        supplier: true,
        glpiGroups: { orderBy: { glpiGroupName: "asc" } },
        amendments: { orderBy: { createdAt: "desc" } },
        financialSnapshots: { orderBy: { recordedAt: "desc" }, take: 50 }
      }
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado");
    return {
      ...contract,
      featureImplantationProportion: buildFeatureImplantationProportion({
        monthlyValue: contract.monthlyValue,
        installationValue: contract.installationValue,
        implementationPeriodStart: contract.implementationPeriodStart,
        implementationPeriodEnd: contract.implementationPeriodEnd,
        modules: contract.modules,
        at: new Date()
      })
    };
  }

  /**
   * Regista um aditivo/reajuste (histórico) e aplica imediatamente valor total, valor mensal e data de término no contrato.
   */
  async createAmendment(contractId: string, dto: CreateContractAmendmentDto): Promise<unknown> {
    const prev = await this.prisma.contract.findFirst({
      where: { id: contractId, deletedAt: null },
      include: { modules: { include: { features: true } }, services: true, fiscal: true, manager: true, supplier: true }
    });
    if (!prev) throw new NotFoundException("Contrato não encontrado");
    if (prev.status !== ContractStatus.ACTIVE) {
      throw new BadRequestException("Só é possível registar aditivos para contratos em estado «Ativo».");
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
   * Grava na memória os valores financeiros actuais do contrato (mensal, total, implantação),
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
    const { glpiGroups, ...rest } = dto;
    const totalValue = dto.totalValue ?? (dto.monthlyValue != null ? dto.monthlyValue * 12 : undefined);
    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        ...rest,
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
    return this.findOne(id);
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

    const groups = new Map<string, { displayName: string; weight: number; features: ContractStructureImportRow[] }>();
    for (const row of rows) {
      const key = moduleGroupKey(row.moduleName);
      const prev = groups.get(key);
      if (!prev) {
        groups.set(key, { displayName: row.moduleName.trim(), weight: row.moduleWeight, features: [row] });
      } else {
        if (Math.abs(prev.weight - row.moduleWeight) > 1e-6) {
          throw new BadRequestException(
            `Peso do módulo inconsistente para «${row.moduleName.trim()}» (linhas ${prev.features[0]?.sourceRow} e ${row.sourceRow}).`
          );
        }
        prev.features.push(row);
      }
    }

    // Transacção interactiva: o timeout por defeito do Prisma (~5 s) é curto para planilhas grandes;
    // ultrapassar fecha a transação e as operações seguintes falham com «Transaction not found».
    await this.prisma.$transaction(
      async (tx) => {
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
                weight: new Prisma.Decimal(group.weight)
              }
            });
            moduleId = created.id;
          }
          const mid = moduleId!;
          const featureRows = group.features.map((fr) => ({
            moduleId: mid,
            name: fr.featureName.trim(),
            weight: new Prisma.Decimal(fr.featureWeight),
            status: fr.featureStatus ?? ContractFeatureStatus.NOT_STARTED,
            deliveryStatus: fr.featureDelivery ?? ContractItemDeliveryStatus.NOT_DELIVERED
          }));
          if (featureRows.length > 0) {
            await tx.contractFeature.createMany({ data: featureRows });
          }
        }
      },
      { maxWait: 30_000, timeout: 180_000 }
    );

    await this.createAudit("Contract", contractId, "IMPORT_STRUCTURE", null, { rows: rows.length, replace: opts.replace });
    return this.findOne(contractId);
  }

  async createModule(contractId: string, dto: CreateContractModuleDto): Promise<unknown> {
    await this.ensureContract(contractId);
    const created = await this.prisma.contractModule.create({
      data: {
        contractId,
        name: dto.name,
        weight: new Prisma.Decimal(dto.weight)
      }
    });
    await this.createAudit("ContractModule", created.id, "CREATE", null, created);
    return this.findOne(contractId);
  }

  async updateModule(contractId: string, moduleId: string, dto: UpdateContractModuleDto): Promise<unknown> {
    await this.ensureModule(contractId, moduleId);
    const prev = await this.prisma.contractModule.findUnique({ where: { id: moduleId } });
    const updated = await this.prisma.contractModule.update({
      where: { id: moduleId },
      data: {
        name: dto.name ?? undefined,
        weight: dto.weight != null ? new Prisma.Decimal(dto.weight) : undefined
      }
    });
    await this.createAudit("ContractModule", moduleId, "UPDATE", prev, updated);
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
    await this.createAudit("ContractModule", moduleId, "DELETE", prev, null);
    return this.findOne(contractId);
  }

  async createFeature(contractId: string, moduleId: string, dto: CreateContractFeatureDto): Promise<unknown> {
    await this.ensureModule(contractId, moduleId);
    const created = await this.prisma.contractFeature.create({
      data: {
        moduleId,
        name: dto.name,
        weight: new Prisma.Decimal(dto.weight),
        status: dto.status ?? ContractFeatureStatus.NOT_STARTED,
        deliveryStatus: dto.deliveryStatus ?? ContractItemDeliveryStatus.NOT_DELIVERED
      }
    });
    await this.createAudit("ContractFeature", created.id, "CREATE", null, created);
    return this.findOne(contractId);
  }

  async updateFeature(
    contractId: string,
    moduleId: string,
    featureId: string,
    dto: UpdateContractFeatureDto
  ): Promise<unknown> {
    await this.ensureFeature(contractId, moduleId, featureId);
    const prev = await this.prisma.contractFeature.findUnique({ where: { id: featureId } });
    const updated = await this.prisma.contractFeature.update({
      where: { id: featureId },
      data: {
        name: dto.name ?? undefined,
        weight: dto.weight != null ? new Prisma.Decimal(dto.weight) : undefined,
        status: dto.status ?? undefined,
        deliveryStatus: dto.deliveryStatus ?? undefined
      }
    });
    await this.createAudit("ContractFeature", featureId, "UPDATE", prev, updated);
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
    await this.createAudit("ContractFeature", featureId, "DELETE", prev, null);
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
    return this.findOne(contractId);
  }

  private async ensureContract(contractId: string): Promise<void> {
    const c = await this.prisma.contract.findFirst({ where: { id: contractId, deletedAt: null } });
    if (!c) throw new NotFoundException("Contrato não encontrado");
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
  }
}
