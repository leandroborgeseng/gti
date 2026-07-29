import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { getAuditActorId } from "../../common/audit-actor";
import { normalizeCatalogAcronym, normalizeCatalogName, sanitizeAcronymUpper } from "../../common/text-normalize";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateOrganizationDto, UpdateOrganizationDto } from "./organizations.dto";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query?: { active?: boolean }): Promise<unknown> {
    const where =
      query?.active === true ? { active: true } : query?.active === false ? { active: false } : undefined;
    return this.prisma.organization.findMany({
      where,
      include: {
        _count: { select: { users: true, contracts: true } }
      },
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });
  }

  async create(dto: CreateOrganizationDto): Promise<unknown> {
    const name = dto.name.trim();
    const acronym = sanitizeAcronymUpper(dto.acronym);
    if (!name) throw new BadRequestException("Informe o nome do órgão.");
    if (!acronym) throw new BadRequestException("Informe a sigla do órgão.");
    const nameNormalized = normalizeCatalogName(name);
    const acronymNormalized = normalizeCatalogAcronym(acronym);
    await this.assertUnique(nameNormalized, acronymNormalized);
    const created = await this.prisma.organization.create({
      data: {
        name,
        acronym,
        code: dto.code?.trim() || null,
        active: dto.active ?? true,
        nameNormalized,
        acronymNormalized
      }
    });
    await this.audit("Organization", created.id, "CREATE", null, created);
    return created;
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<unknown> {
    const prev = await this.prisma.organization.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException("Órgão não encontrado.");
    const name = dto.name !== undefined ? dto.name.trim() : prev.name;
    const acronym = dto.acronym !== undefined ? sanitizeAcronymUpper(dto.acronym) : prev.acronym;
    if (!name) throw new BadRequestException("Informe o nome do órgão.");
    if (!acronym) throw new BadRequestException("Informe a sigla do órgão.");
    const nameNormalized = normalizeCatalogName(name);
    const acronymNormalized = normalizeCatalogAcronym(acronym);
    await this.assertUnique(nameNormalized, acronymNormalized, id);
    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        name,
        acronym,
        nameNormalized,
        acronymNormalized,
        code: dto.code === undefined ? undefined : dto.code?.trim() || null,
        active: dto.active ?? undefined
      }
    });
    await this.audit("Organization", id, "UPDATE", prev, updated);
    return updated;
  }

  async setActive(id: string, active: boolean): Promise<unknown> {
    const prev = await this.prisma.organization.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException("Órgão não encontrado.");
    const updated = await this.prisma.organization.update({
      where: { id },
      data: { active }
    });
    await this.audit("Organization", id, active ? "ACTIVATE" : "DEACTIVATE", prev, updated);
    return updated;
  }

  async delete(id: string): Promise<{ ok: true; id: string }> {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { _count: { select: { users: true, contracts: true } } }
    });
    if (!org) throw new NotFoundException("Órgão não encontrado.");
    if (org._count.users > 0 || org._count.contracts > 0) {
      throw new BadRequestException(
        "Não é possível excluir o órgão: existem usuários ou contratos vinculados. Inative-o em vez de excluir."
      );
    }
    await this.audit("Organization", id, "DELETE", org, null);
    await this.prisma.organization.delete({ where: { id } });
    return { ok: true, id };
  }

  private async assertUnique(nameNormalized: string, acronymNormalized: string, excludeId?: string): Promise<void> {
    const conflict = await this.prisma.organization.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        OR: [{ nameNormalized }, { acronymNormalized }]
      }
    });
    if (conflict) {
      if (conflict.nameNormalized === nameNormalized) {
        throw new ConflictException("Já existe um órgão com este nome.");
      }
      throw new ConflictException("Já existe um órgão com esta sigla.");
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
