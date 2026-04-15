import { Injectable, NotFoundException } from "@nestjs/common";
import { ContractStatus, LawType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateContractDto, UpdateContractDto } from "./contracts.dto";

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateContractDto): Promise<unknown> {
    const totalValue = dto.totalValue ?? dto.monthlyValue * 12;
    const managerId = dto.managerId ?? dto.fiscalId;
    const created = await this.prisma.contract.create({
      data: {
        ...dto,
        lawType: dto.lawType ?? LawType.LEI_14133,
        status: dto.status ?? ContractStatus.ACTIVE,
        managerId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        totalValue: new Prisma.Decimal(totalValue),
        monthlyValue: new Prisma.Decimal(dto.monthlyValue),
        slaTarget: dto.slaTarget != null ? new Prisma.Decimal(dto.slaTarget) : null
      }
    });
    await this.createAudit("Contract", created.id, "CREATE", null, created);
    return created;
  }

  async findAll(): Promise<unknown> {
    return this.prisma.contract.findMany({
      where: { deletedAt: null },
      include: { fiscal: true, manager: true, supplier: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async findOne(id: string): Promise<unknown> {
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null },
      include: { modules: { include: { features: true } }, services: true, fiscal: true, manager: true, supplier: true }
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado");
    return contract;
  }

  async update(id: string, dto: UpdateContractDto): Promise<unknown> {
    const prev = await this.prisma.contract.findFirst({ where: { id, deletedAt: null } });
    if (!prev) throw new NotFoundException("Contrato não encontrado");
    const totalValue = dto.totalValue ?? (dto.monthlyValue != null ? dto.monthlyValue * 12 : undefined);
    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        totalValue: totalValue != null ? new Prisma.Decimal(totalValue) : undefined,
        monthlyValue: dto.monthlyValue != null ? new Prisma.Decimal(dto.monthlyValue) : undefined,
        slaTarget: dto.slaTarget != null ? new Prisma.Decimal(dto.slaTarget) : dto.slaTarget === null ? null : undefined
      }
    });
    await this.createAudit("Contract", id, "UPDATE", prev, updated);
    return updated;
  }

  private async createAudit(entity: string, entityId: string, action: string, oldData: unknown, newData: unknown): Promise<void> {
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
