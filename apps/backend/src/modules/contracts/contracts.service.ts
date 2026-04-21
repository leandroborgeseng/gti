import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId } from "../../common/audit-actor";
import { ContractFeatureStatus, ContractItemDeliveryStatus, ContractStatus, ContractType, LawType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateContractAmendmentDto,
  CreateContractDto,
  CreateContractFeatureDto,
  CreateContractModuleDto,
  CreateContractServiceDto,
  ContractGlpiGroupLinkDto,
  UpdateContractDto,
  UpdateContractFeatureDto,
  UpdateContractModuleDto,
  UpdateContractServiceDto
} from "./contracts.dto";

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
  /** Valor mensal × (implantadas / total funcionalidades), duas casas decimais */
  proportionalMonthlyValue: string | null;
  explanation: string | null;
};

/**
 * Proporção do valor mensal alinhada às funcionalidades **entregues** (implantadas):
 * (nº com entrega «Entregue» / total de funcionalidades em módulos) × valor mensal do contrato.
 * Parciais e não entregues entram só no total (denominador), não no numerador.
 */
function buildFeatureImplantationProportion(
  monthlyValue: Prisma.Decimal,
  modules: Array<{ features: Array<{ deliveryStatus: ContractItemDeliveryStatus }> }>
): FeatureImplantationProportionDto {
  let totalFeatures = 0;
  let implantedCount = 0;
  let partialCount = 0;
  let notDeliveredCount = 0;
  for (const m of modules) {
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
  const monthly = new Prisma.Decimal(monthlyValue);
  const contractMonthlyValue = monthly.toFixed(2);
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
      explanation:
        "Não existem funcionalidades em módulos; não é possível calcular o valor mensal proporcional à implantação."
    };
  }
  const ratioDec = new Prisma.Decimal(implantedCount).div(new Prisma.Decimal(totalFeatures));
  const proportional = monthly.mul(ratioDec).toDecimalPlaces(2);
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
    proportionalMonthlyValue: proportional.toFixed(2),
    explanation: null
  };
}

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateContractDto): Promise<unknown> {
    const { glpiGroups, ...rest } = dto;
    const totalValue = rest.totalValue ?? rest.monthlyValue * 12;
    const managerId = rest.managerId ?? rest.fiscalId;
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
      featureImplantationProportion: buildFeatureImplantationProportion(row.monthlyValue, row.modules)
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
        amendments: { orderBy: { createdAt: "desc" } }
      }
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado");
    return {
      ...contract,
      featureImplantationProportion: buildFeatureImplantationProportion(contract.monthlyValue, contract.modules)
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

  async update(id: string, dto: UpdateContractDto): Promise<unknown> {
    const prev = await this.prisma.contract.findFirst({ where: { id, deletedAt: null } });
    if (!prev) throw new NotFoundException("Contrato não encontrado");
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
        slaTarget: dto.slaTarget != null ? new Prisma.Decimal(dto.slaTarget) : dto.slaTarget === null ? null : undefined
      }
    });
    await this.createAudit("Contract", id, "UPDATE", prev, updated);
    return this.findOne(id);
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
