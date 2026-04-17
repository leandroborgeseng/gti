import { Injectable } from "@nestjs/common";
import { getAuditActorId } from "../../common/audit-actor";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateFiscalDto } from "./fiscais.dto";

@Injectable()
export class FiscaisService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFiscalDto): Promise<unknown> {
    const created = await this.prisma.fiscal.create({ data: dto });
    await this.audit("Fiscal", created.id, "CREATE", null, created);
    return created;
  }

  async findAll(): Promise<unknown> {
    return this.prisma.fiscal.findMany({
      include: {
        contractsAsFiscal: { where: { deletedAt: null }, select: { id: true, number: true, name: true, status: true } },
        contractsAsManager: { where: { deletedAt: null }, select: { id: true, number: true, name: true, status: true } }
      },
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
