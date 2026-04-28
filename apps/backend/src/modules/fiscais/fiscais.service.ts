import { Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId } from "../../common/audit-actor";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateFiscalDto, UpdateFiscalDto } from "./fiscais.dto";

@Injectable()
export class FiscaisService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFiscalDto): Promise<unknown> {
    const created = await this.prisma.fiscal.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone.trim(),
        userId: dto.userId?.trim() || null
      }
    });
    await this.audit("Fiscal", created.id, "CREATE", null, created);
    return created;
  }

  async update(id: string, dto: UpdateFiscalDto): Promise<unknown> {
    const previous = await this.prisma.fiscal.findUnique({ where: { id } });
    if (!previous) {
      throw new NotFoundException("Fiscal ou gestor não encontrado");
    }

    const updated = await this.prisma.fiscal.update({
      where: { id },
      data: {
        name: dto.name?.trim() || previous.name,
        email: dto.email?.trim().toLowerCase() || previous.email,
        phone: dto.phone?.trim() || previous.phone,
        userId: dto.userId === undefined ? previous.userId : dto.userId?.trim() || null
      }
    });
    await this.audit("Fiscal", updated.id, "UPDATE", previous, updated);
    return updated;
  }

  async findUserOptions(): Promise<Array<{ id: string; email: string; role: string }>> {
    return this.prisma.user.findMany({
      where: { approvalStatus: "APPROVED" },
      orderBy: { email: "asc" },
      select: { id: true, email: true, role: true }
    });
  }

  async findAll(): Promise<unknown> {
    return this.prisma.fiscal.findMany({
      include: {
        user: { select: { id: true, email: true, role: true } },
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
