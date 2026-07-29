import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId } from "../../common/audit-actor";
import { normalizeCatalogName } from "../../common/text-normalize";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateHiringTypeDto, UpdateHiringTypeDto } from "./hiring-types.dto";

@Injectable()
export class HiringTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query?: { active?: boolean }): Promise<unknown> {
    const where =
      query?.active === true ? { active: true } : query?.active === false ? { active: false } : undefined;
    return this.prisma.hiringType.findMany({
      where,
      include: { _count: { select: { contracts: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });
  }

  async create(dto: CreateHiringTypeDto): Promise<unknown> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("Informe o nome do tipo de contratação.");
    const nameNormalized = normalizeCatalogName(name);
    await this.assertUnique(nameNormalized);
    const created = await this.prisma.hiringType.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 500,
        nameNormalized
      }
    });
    await this.audit("HiringType", created.id, "CREATE", null, created);
    return created;
  }

  async update(id: string, dto: UpdateHiringTypeDto): Promise<unknown> {
    const prev = await this.prisma.hiringType.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException("Tipo de contratação não encontrado.");
    const name = dto.name !== undefined ? dto.name.trim() : prev.name;
    if (!name) throw new BadRequestException("Informe o nome do tipo de contratação.");
    const nameNormalized = normalizeCatalogName(name);
    await this.assertUnique(nameNormalized, id);
    const updated = await this.prisma.hiringType.update({
      where: { id },
      data: {
        name,
        nameNormalized,
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        active: dto.active ?? undefined,
        sortOrder: dto.sortOrder ?? undefined
      }
    });
    await this.audit("HiringType", id, "UPDATE", prev, updated);
    return updated;
  }

  async delete(id: string): Promise<{ ok: true; id: string }> {
    const row = await this.prisma.hiringType.findUnique({
      where: { id },
      include: { _count: { select: { contracts: true } } }
    });
    if (!row) throw new NotFoundException("Tipo de contratação não encontrado.");
    if (row._count.contracts > 0) {
      throw new BadRequestException(
        "Não é possível excluir o tipo: existem contratos vinculados. Inative-o em vez de excluir."
      );
    }
    await this.audit("HiringType", id, "DELETE", row, null);
    await this.prisma.hiringType.delete({ where: { id } });
    return { ok: true, id };
  }

  private async assertUnique(nameNormalized: string, excludeId?: string): Promise<void> {
    const conflict = await this.prisma.hiringType.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        nameNormalized
      }
    });
    if (conflict) {
      throw new ConflictException("Já existe um tipo de contratação com este nome.");
    }
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
