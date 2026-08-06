import { Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId } from "../../common/audit-actor";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateSupplierDto, UpdateSupplierDto } from "./suppliers.dto";

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSupplierDto): Promise<unknown> {
    const created = await this.prisma.supplier.create({
      data: {
        name: dto.name,
        cnpj: dto.cnpj,
        contacts: dto.contacts === undefined ? undefined : (dto.contacts as unknown as Prisma.InputJsonValue)
      }
    });
    await this.audit("Supplier", created.id, "CREATE", null, created);
    return created;
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<unknown> {
    const prev = await this.prisma.supplier.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException("Fornecedor não encontrado.");
    const updated = await this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name,
        cnpj: dto.cnpj,
        contacts:
          dto.contacts === undefined
            ? undefined
            : dto.contacts === null
              ? Prisma.DbNull
              : (dto.contacts as unknown as Prisma.InputJsonValue)
      },
      include: { contracts: { where: { deletedAt: null }, select: { id: true, number: true, name: true, status: true } } }
    });
    await this.audit("Supplier", id, "UPDATE", prev, updated);
    return updated;
  }

  async findAll(): Promise<unknown> {
    return this.prisma.supplier.findMany({
      include: { contracts: { where: { deletedAt: null }, select: { id: true, number: true, name: true, status: true } } },
      orderBy: { name: "asc" }
    });
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
