import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateSupplierDto } from "./suppliers.dto";

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSupplierDto): Promise<unknown> {
    const created = await this.prisma.supplier.create({ data: dto });
    await this.audit("Supplier", created.id, "CREATE", null, created);
    return created;
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
        userId: "system",
        oldData: oldData ? (oldData as Prisma.InputJsonValue) : undefined,
        newData: newData ? (newData as Prisma.InputJsonValue) : undefined
      }
    });
  }
}
