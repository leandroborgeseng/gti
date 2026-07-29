import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId } from "../../common/audit-actor";
import { normalizeCatalogAcronym, normalizeCatalogName, sanitizeAcronymUpper } from "../../common/text-normalize";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateContractTypeCatalogDto, UpdateContractTypeCatalogDto } from "./contract-type-catalog.dto";

@Injectable()
export class ContractTypeCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query?: { active?: boolean }): Promise<unknown> {
    const where =
      query?.active === true ? { active: true } : query?.active === false ? { active: false } : undefined;
    return this.prisma.contractTypeCatalog.findMany({
      where,
      include: { _count: { select: { contracts: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });
  }

  async create(dto: CreateContractTypeCatalogDto): Promise<unknown> {
    const name = dto.name.trim();
    const acronym = sanitizeAcronymUpper(dto.acronym);
    if (!name) throw new BadRequestException("Informe o nome do tipo de contrato.");
    if (!acronym) throw new BadRequestException("Informe a sigla do tipo de contrato.");
    const nameNormalized = normalizeCatalogName(name);
    const acronymNormalized = normalizeCatalogAcronym(acronym);
    await this.assertUnique(nameNormalized, acronymNormalized);
    const created = await this.prisma.contractTypeCatalog.create({
      data: {
        name,
        acronym,
        description: dto.description?.trim() || null,
        active: dto.active ?? true,
        legacyEnum: dto.legacyEnum ?? null,
        sortOrder: dto.sortOrder ?? 500,
        nameNormalized,
        acronymNormalized
      }
    });
    await this.audit("ContractTypeCatalog", created.id, "CREATE", null, created);
    return created;
  }

  async update(id: string, dto: UpdateContractTypeCatalogDto): Promise<unknown> {
    const prev = await this.prisma.contractTypeCatalog.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException("Tipo de contrato não encontrado.");
    const name = dto.name !== undefined ? dto.name.trim() : prev.name;
    const acronym = dto.acronym !== undefined ? sanitizeAcronymUpper(dto.acronym) : prev.acronym;
    if (!name) throw new BadRequestException("Informe o nome do tipo de contrato.");
    if (!acronym) throw new BadRequestException("Informe a sigla do tipo de contrato.");
    const nameNormalized = normalizeCatalogName(name);
    const acronymNormalized = normalizeCatalogAcronym(acronym);
    await this.assertUnique(nameNormalized, acronymNormalized, id);
    const updated = await this.prisma.contractTypeCatalog.update({
      where: { id },
      data: {
        name,
        acronym,
        nameNormalized,
        acronymNormalized,
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        active: dto.active ?? undefined,
        legacyEnum: dto.legacyEnum === undefined ? undefined : dto.legacyEnum,
        sortOrder: dto.sortOrder ?? undefined
      }
    });
    await this.audit("ContractTypeCatalog", id, "UPDATE", prev, updated);
    return updated;
  }

  async delete(id: string): Promise<{ ok: true; id: string }> {
    const row = await this.prisma.contractTypeCatalog.findUnique({
      where: { id },
      include: { _count: { select: { contracts: true } } }
    });
    if (!row) throw new NotFoundException("Tipo de contrato não encontrado.");
    if (row._count.contracts > 0) {
      throw new BadRequestException(
        "Não é possível excluir o tipo: existem contratos vinculados. Inative-o em vez de excluir."
      );
    }
    await this.audit("ContractTypeCatalog", id, "DELETE", row, null);
    await this.prisma.contractTypeCatalog.delete({ where: { id } });
    return { ok: true, id };
  }

  private async assertUnique(nameNormalized: string, acronymNormalized: string, excludeId?: string): Promise<void> {
    const conflict = await this.prisma.contractTypeCatalog.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        OR: [{ nameNormalized }, { acronymNormalized }]
      }
    });
    if (conflict) {
      if (conflict.nameNormalized === nameNormalized) {
        throw new ConflictException("Já existe um tipo de contrato com este nome.");
      }
      throw new ConflictException("Já existe um tipo de contrato com esta sigla.");
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
