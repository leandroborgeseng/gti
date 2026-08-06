import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ExternalUserFunction, UserApprovalStatus, UserKind, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { getAuditActorId } from "../../common/audit-actor";
import { EXTERNAL_PROFILE_ID } from "../../common/external-access";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto, UpdateMyProfileDto, UpdateUserDto } from "./users.dto";

const USER_SELECT = {
  id: true,
  email: true,
  cpf: true,
  firstName: true,
  lastName: true,
  displayName: true,
  profileColor: true,
  jobTitle: true,
  department: true,
  phone: true,
  organizationId: true,
  organization: { select: { id: true, name: true, acronym: true, active: true } },
  allOrganizations: true,
  defaultProfileId: true,
  defaultOrganizationId: true,
  role: true,
  approvalStatus: true,
  mustChangePassword: true,
  userKind: true,
  externalFunction: true,
  supplierId: true,
  supplier: { select: { id: true, name: true, cnpj: true } },
  externalContracts: {
    select: {
      contractId: true,
      contract: { select: { id: true, number: true, name: true, internalCode: true, supplierId: true } }
    }
  },
  createdAt: true,
  updatedAt: true,
  accessProfiles: {
    select: {
      isDefault: true,
      profile: { select: { id: true, name: true, systemKey: true, active: true } }
    }
  },
  organizations: {
    select: {
      isDefault: true,
      organization: { select: { id: true, name: true, acronym: true, active: true } }
    }
  }
} as const;

const PROFILE_COLORS = new Set([
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#475569",
  "#111827"
]);

const REQUIRED_ADMIN_KEYS = ["admin.users.manage", "admin.permissions.manage"] as const;

function normalizeCpfDigits(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return digits;
}

function validateCpfDigits(cpf: string): void {
  if (cpf.length !== 11) {
    throw new BadRequestException("CPF deve conter 11 dígitos.");
  }
}

function maskCpf(cpf: string | null): string | null {
  if (!cpf || cpf.length !== 11) return null;
  return `***.***.***-${cpf.slice(-2)}`;
}

function resolveNameParts(dto: { fullName?: string; firstName?: string; lastName?: string }): {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
} {
  if (dto.fullName?.trim()) {
    const parts = dto.fullName.trim().split(/\s+/);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ") || null;
    const displayName = [firstName, lastName].filter(Boolean).join(" ") || null;
    return { firstName: firstName || null, lastName, displayName };
  }
  const firstName = dto.firstName?.trim() || null;
  const lastName = dto.lastName?.trim() || null;
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || null;
  return { firstName, lastName, displayName };
}

type UserSelectRow = {
  id: string;
  email: string;
  cpf: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  profileColor: string | null;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  organizationId: string | null;
  organization: { id: string; name: string; acronym: string; active: boolean } | null;
  allOrganizations: boolean;
  defaultProfileId: string | null;
  defaultOrganizationId: string | null;
  role: UserRole;
  approvalStatus: UserApprovalStatus;
  mustChangePassword: boolean;
  userKind: UserKind;
  externalFunction: ExternalUserFunction | null;
  supplierId: string | null;
  supplier: { id: string; name: string; cnpj: string } | null;
  externalContracts: Array<{
    contractId: string;
    contract: { id: string; number: string; name: string; internalCode: string | null; supplierId: string | null };
  }>;
  createdAt: Date;
  updatedAt: Date;
  accessProfiles: Array<{
    isDefault: boolean;
    profile: { id: string; name: string; systemKey: string | null; active: boolean };
  }>;
  organizations: Array<{
    isDefault: boolean;
    organization: { id: string; name: string; acronym: string; active: boolean };
  }>;
};

function mapUserRow(row: UserSelectRow) {
  const { cpf, accessProfiles, organizations, externalContracts, ...rest } = row;
  const profiles = accessProfiles.map((l) => ({
    id: l.profile.id,
    name: l.profile.name,
    systemKey: l.profile.systemKey,
    active: l.profile.active,
    isDefault: l.isDefault
  }));
  const orgs = organizations.map((l) => ({
    id: l.organization.id,
    name: l.organization.name,
    acronym: l.organization.acronym,
    active: l.organization.active,
    isDefault: l.isDefault
  }));
  const authorizedContracts = externalContracts.map((l) => ({
    id: l.contract.id,
    number: l.contract.number,
    name: l.contract.name,
    internalCode: l.contract.internalCode
  }));
  return {
    ...rest,
    cpfMasked: maskCpf(cpf),
    cpfDigits: cpf,
    profiles,
    organizations: orgs,
    authorizedContractIds: authorizedContracts.map((c) => c.id),
    authorizedContracts,
    allOrganizations: row.allOrganizations,
    profileSummary:
      profiles.length <= 1
        ? profiles[0]?.name ?? null
        : `${profiles[0]?.name ?? "Perfil"} +${profiles.length - 1} perfis`,
    organizationSummary:
      row.userKind === "EXTERNAL"
        ? row.supplier
          ? `${row.supplier.name} · ${authorizedContracts.length} contrato(s)`
          : "Externo"
        : row.allOrganizations
          ? orgs.length === 0
            ? "Todos os órgãos"
            : `Todos os órgãos · +${orgs.length} vínculos`
          : orgs.length <= 1
            ? orgs[0]?.acronym || orgs[0]?.name || null
            : `${orgs[0]?.acronym || orgs[0]?.name} +${orgs.length - 1} órgãos`
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.user.findMany({
      orderBy: { email: "asc" },
      select: USER_SELECT
    });
    return rows.map((row) => mapUserRow(row));
  }

  async findOptions(opts?: { includeInactive?: boolean }): Promise<
    Array<{
      id: string;
      name: string;
      email: string;
      organizationAcronym: string | null;
      active: boolean;
    }>
  > {
    const rows = await this.prisma.user.findMany({
      where: opts?.includeInactive ? undefined : { approvalStatus: UserApprovalStatus.APPROVED },
      orderBy: [{ displayName: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        approvalStatus: true,
        organization: { select: { acronym: true } },
        organizations: {
          take: 1,
          where: { isDefault: true },
          select: { organization: { select: { acronym: true } } }
        }
      }
    });
    return rows.map((row) => {
      const composed = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
      const name = row.displayName?.trim() || composed || row.email;
      return {
        id: row.id,
        name,
        email: row.email,
        organizationAcronym:
          row.organization?.acronym ?? row.organizations[0]?.organization.acronym ?? null,
        active: row.approvalStatus === UserApprovalStatus.APPROVED
      };
    });
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } }
    });
    if (exists) {
      throw new ConflictException("Já existe usuário com este e-mail.");
    }
    const cpf = normalizeCpfDigits(dto.cpf);
    if (cpf) {
      validateCpfDigits(cpf);
      const cpfTaken = await this.prisma.user.findUnique({ where: { cpf } });
      if (cpfTaken) throw new ConflictException("Já existe usuário com este CPF.");
    }

    const userKind = dto.userKind ?? UserKind.INTERNAL;
    const names = resolveNameParts(dto);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    if (userKind === UserKind.EXTERNAL) {
      const external = await this.resolveExternalLinks(dto);
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            cpf,
            ...names,
            organizationId: null,
            allOrganizations: false,
            defaultProfileId: EXTERNAL_PROFILE_ID,
            defaultOrganizationId: null,
            lastActiveProfileId: EXTERNAL_PROFILE_ID,
            lastActiveOrganizationId: null,
            passwordHash,
            mustChangePassword: true,
            approvalStatus: UserApprovalStatus.APPROVED,
            role: UserRole.VIEWER,
            userKind: UserKind.EXTERNAL,
            supplierId: external.supplierId,
            externalFunction: external.externalFunction
          }
        });
        await tx.userAccessProfile.create({
          data: { userId: user.id, profileId: EXTERNAL_PROFILE_ID, isDefault: true }
        });
        if (external.contractIds.length > 0) {
          await tx.userExternalContract.createMany({
            data: external.contractIds.map((contractId) => ({ userId: user.id, contractId }))
          });
        }
        await tx.auditLog.create({
          data: {
            entity: "User",
            entityId: user.id,
            action: "CREATE",
            userId: getAuditActorId(),
            newData: { userKind: "EXTERNAL", email, supplierId: external.supplierId, approvalStatus: "APPROVED" }
          }
        });
        return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: USER_SELECT });
      });
      return mapUserRow(created);
    }

    const access = await this.resolveAccessLinks(dto);
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          cpf,
          ...names,
          organizationId: access.primaryOrganizationId,
          allOrganizations: access.allOrganizations,
          defaultProfileId: access.defaultProfileId,
          defaultOrganizationId: access.defaultOrganizationId,
          lastActiveProfileId: access.defaultProfileId,
          lastActiveOrganizationId: access.defaultOrganizationId,
          passwordHash,
          mustChangePassword: true,
          approvalStatus: UserApprovalStatus.APPROVED,
          role: access.legacyRole,
          userKind: UserKind.INTERNAL
        }
      });
      await tx.userAccessProfile.createMany({
        data: access.profileIds.map((profileId) => ({
          userId: user.id,
          profileId,
          isDefault: profileId === access.defaultProfileId
        }))
      });
      if (access.organizationIds.length > 0) {
        await tx.userOrganization.createMany({
          data: access.organizationIds.map((organizationId) => ({
            userId: user.id,
            organizationId,
            isDefault: organizationId === access.defaultOrganizationId
          }))
        });
      }
      return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: USER_SELECT });
    });

    return mapUserRow(created);
  }

  async update(id: string, dto: UpdateUserDto): Promise<unknown> {
    const prev = await this.prisma.user.findUnique({
      where: { id },
      include: {
        accessProfiles: { select: { profileId: true, profile: { select: { systemKey: true } } } }
      }
    });
    if (!prev) {
      throw new NotFoundException("Usuário não encontrado");
    }

    const access =
      dto.profileIds !== undefined ||
      dto.organizationIds !== undefined ||
      dto.allOrganizations !== undefined ||
      dto.role !== undefined ||
      dto.organizationId !== undefined ||
      dto.defaultProfileId !== undefined ||
      dto.defaultOrganizationId !== undefined
        ? await this.resolveAccessLinks({
            profileIds: dto.profileIds,
            organizationIds: dto.organizationIds,
            allOrganizations: dto.allOrganizations,
            role: dto.role,
            organizationId: dto.organizationId ?? undefined,
            defaultProfileId: dto.defaultProfileId,
            defaultOrganizationId: dto.defaultOrganizationId,
            // ao atualizar parcialmente, manter vínculos atuais se não enviados
            _existingProfileIds: prev.accessProfiles.map((l) => l.profileId),
            _existingOrgIds: (
              await this.prisma.userOrganization.findMany({
                where: { userId: id },
                select: { organizationId: true }
              })
            ).map((l) => l.organizationId),
            _existingAllOrganizations: prev.allOrganizations
          })
        : null;

    if (access || dto.approvalStatus !== undefined) {
      const wouldLoseAdminCapability = await this.wouldRemoveLastCapableAdmin(id, {
        approvalStatus: dto.approvalStatus ?? prev.approvalStatus,
        profileIds: access?.profileIds
      });
      if (wouldLoseAdminCapability) {
        throw new BadRequestException(
          "Não é possível remover o último administrador aprovado capaz de gerir usuários e permissões."
        );
      }
    }

    if (dto.cpf !== undefined) {
      const cpf = normalizeCpfDigits(dto.cpf);
      if (cpf) {
        validateCpfDigits(cpf);
        const cpfTaken = await this.prisma.user.findFirst({
          where: { cpf, id: { not: id } }
        });
        if (cpfTaken) throw new ConflictException("Já existe usuário com este CPF.");
      }
    }

    const passwordHash =
      dto.password !== undefined && dto.password !== "" ? await bcrypt.hash(dto.password, 10) : undefined;
    const names =
      dto.fullName !== undefined || dto.firstName !== undefined || dto.lastName !== undefined
        ? resolveNameParts(dto)
        : null;

    const nextKind = dto.userKind ?? prev.userKind;
    const externalPatch =
      nextKind === UserKind.EXTERNAL &&
      (dto.supplierId !== undefined ||
        dto.externalFunction !== undefined ||
        dto.authorizedContractIds !== undefined ||
        dto.userKind === UserKind.EXTERNAL)
        ? await this.resolveExternalLinks({
            supplierId: dto.supplierId ?? prev.supplierId ?? undefined,
            externalFunction: dto.externalFunction ?? prev.externalFunction ?? undefined,
            authorizedContractIds: dto.authorizedContractIds
          })
        : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (nextKind === UserKind.EXTERNAL) {
        await tx.userAccessProfile.deleteMany({ where: { userId: id } });
        await tx.userAccessProfile.create({
          data: { userId: id, profileId: EXTERNAL_PROFILE_ID, isDefault: true }
        });
        await tx.userOrganization.deleteMany({ where: { userId: id } });
        if (externalPatch || dto.authorizedContractIds !== undefined) {
          const contractIds = externalPatch?.contractIds ?? dto.authorizedContractIds ?? [];
          await tx.userExternalContract.deleteMany({ where: { userId: id } });
          if (contractIds.length > 0) {
            await tx.userExternalContract.createMany({
              data: contractIds.map((contractId) => ({ userId: id, contractId }))
            });
          }
        }
      } else if (access) {
        await tx.userAccessProfile.deleteMany({ where: { userId: id } });
        await tx.userAccessProfile.createMany({
          data: access.profileIds.map((profileId) => ({
            userId: id,
            profileId,
            isDefault: profileId === access.defaultProfileId
          }))
        });
        await tx.userOrganization.deleteMany({ where: { userId: id } });
        if (access.organizationIds.length > 0) {
          await tx.userOrganization.createMany({
            data: access.organizationIds.map((organizationId) => ({
              userId: id,
              organizationId,
              isDefault: organizationId === access.defaultOrganizationId
            }))
          });
        }
        await tx.userPermission.deleteMany({
          where: { userId: id, profileId: { notIn: access.profileIds } }
        });
        await tx.userExternalContract.deleteMany({ where: { userId: id } });
      }

      const row = await tx.user.update({
        where: { id },
        data: {
          approvalStatus: dto.approvalStatus ?? undefined,
          cpf: dto.cpf === undefined ? undefined : normalizeCpfDigits(dto.cpf),
          ...(nextKind === UserKind.EXTERNAL
            ? {
                userKind: UserKind.EXTERNAL,
                role: UserRole.VIEWER,
                organizationId: null,
                allOrganizations: false,
                defaultProfileId: EXTERNAL_PROFILE_ID,
                defaultOrganizationId: null,
                lastActiveProfileId: EXTERNAL_PROFILE_ID,
                lastActiveOrganizationId: null,
                supplierId: externalPatch?.supplierId ?? dto.supplierId ?? undefined,
                externalFunction: externalPatch?.externalFunction ?? dto.externalFunction ?? undefined
              }
            : access
              ? {
                  userKind: UserKind.INTERNAL,
                  supplierId: null,
                  externalFunction: null,
                  role: access.legacyRole,
                  organizationId: access.primaryOrganizationId,
                  allOrganizations: access.allOrganizations,
                  defaultProfileId: access.defaultProfileId,
                  defaultOrganizationId: access.defaultOrganizationId,
                  lastActiveProfileId: access.profileIds.includes(prev.lastActiveProfileId ?? "")
                    ? prev.lastActiveProfileId
                    : access.defaultProfileId,
                  lastActiveOrganizationId: access.allOrganizations
                    ? prev.lastActiveOrganizationId &&
                      (access.organizationIds.includes(prev.lastActiveOrganizationId) ||
                        access.allOrganizations)
                      ? prev.lastActiveOrganizationId
                      : access.defaultOrganizationId
                    : access.organizationIds.includes(prev.lastActiveOrganizationId ?? "")
                      ? prev.lastActiveOrganizationId
                      : access.defaultOrganizationId
                }
              : dto.role !== undefined
                ? { role: dto.role }
                : {}),
          ...(names
            ? {
                firstName: names.firstName,
                lastName: names.lastName,
                displayName: names.displayName
              }
            : {}),
          ...(passwordHash ? { passwordHash, mustChangePassword: true } : {})
        },
        select: USER_SELECT
      });

      if (dto.approvalStatus !== undefined && dto.approvalStatus !== prev.approvalStatus) {
        await tx.auditLog.create({
          data: {
            entity: "User",
            entityId: id,
            action: "UPDATE",
            userId: getAuditActorId(),
            oldData: { approvalStatus: prev.approvalStatus },
            newData: { approvalStatus: dto.approvalStatus, userKind: nextKind }
          }
        });
      }

      return row;
    });

    return mapUserRow(updated);
  }

  async updateMyProfile(
    id: string,
    dto: UpdateMyProfileDto
  ): Promise<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    profileColor: string | null;
    jobTitle: string | null;
    department: string | null;
    phone: string | null;
    role: UserRole;
    approvalStatus: UserApprovalStatus;
    mustChangePassword: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const firstName = typeof dto.firstName === "string" ? dto.firstName.trim() : "";
    const lastName = typeof dto.lastName === "string" ? dto.lastName.trim() : "";
    const displayName = [firstName, lastName].filter(Boolean).join(" ");
    const profileColor = typeof dto.profileColor === "string" ? dto.profileColor.trim().toLowerCase() : "";
    const jobTitle = typeof dto.jobTitle === "string" ? dto.jobTitle.trim() : "";
    const department = typeof dto.department === "string" ? dto.department.trim() : "";
    const phone = typeof dto.phone === "string" ? dto.phone.trim() : "";
    if (firstName.length > 40) {
      throw new BadRequestException("O nome deve ter no máximo 40 caracteres.");
    }
    if (lastName.length > 60) {
      throw new BadRequestException("O sobrenome deve ter no máximo 60 caracteres.");
    }
    if (jobTitle.length > 80) {
      throw new BadRequestException("O cargo/função deve ter no máximo 80 caracteres.");
    }
    if (department.length > 80) {
      throw new BadRequestException("O setor/unidade deve ter no máximo 80 caracteres.");
    }
    if (phone.length > 40) {
      throw new BadRequestException("O telefone/ramal deve ter no máximo 40 caracteres.");
    }
    if (profileColor && !PROFILE_COLORS.has(profileColor)) {
      throw new BadRequestException("Selecione uma cor válida da paleta.");
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        firstName: firstName || null,
        lastName: lastName || null,
        displayName: displayName || null,
        profileColor: profileColor || null,
        jobTitle: jobTitle || null,
        department: department || null,
        phone: phone || null
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        profileColor: true,
        jobTitle: true,
        department: true,
        phone: true,
        role: true,
        approvalStatus: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  private async resolveExternalLinks(dto: {
    supplierId?: string | null;
    externalFunction?: ExternalUserFunction | null;
    authorizedContractIds?: string[];
  }): Promise<{
    supplierId: string;
    externalFunction: ExternalUserFunction;
    contractIds: string[];
  }> {
    if (!dto.supplierId) {
      throw new BadRequestException("Usuário externo exige fornecedor (CNPJ) obrigatório.");
    }
    if (!dto.externalFunction) {
      throw new BadRequestException("Informe a função do usuário externo.");
    }
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) throw new BadRequestException("Fornecedor inválido.");

    const contractIds = [...new Set((dto.authorizedContractIds ?? []).filter(Boolean))];
    if (contractIds.length > 0) {
      const contracts = await this.prisma.contract.findMany({
        where: { id: { in: contractIds }, deletedAt: null },
        select: { id: true, supplierId: true, cnpj: true }
      });
      if (contracts.length !== contractIds.length) {
        throw new BadRequestException("Um ou mais contratos autorizados são inválidos.");
      }
      for (const c of contracts) {
        const sameSupplier =
          c.supplierId === supplier.id || c.cnpj.replace(/\D/g, "") === supplier.cnpj.replace(/\D/g, "");
        if (!sameSupplier) {
          throw new BadRequestException(
            "Todos os contratos autorizados devem pertencer ao mesmo fornecedor do usuário."
          );
        }
      }
    }
    return { supplierId: supplier.id, externalFunction: dto.externalFunction, contractIds };
  }

  private async resolveAccessLinks(dto: {
    profileIds?: string[];
    organizationIds?: string[];
    allOrganizations?: boolean;
    role?: UserRole;
    organizationId?: string | null;
    defaultProfileId?: string;
    defaultOrganizationId?: string | null;
    _existingProfileIds?: string[];
    _existingOrgIds?: string[];
    _existingAllOrganizations?: boolean;
  }): Promise<{
    profileIds: string[];
    organizationIds: string[];
    allOrganizations: boolean;
    defaultProfileId: string;
    defaultOrganizationId: string | null;
    primaryOrganizationId: string | null;
    legacyRole: UserRole;
  }> {
    let profileIds = dto.profileIds;
    if (!profileIds || profileIds.length === 0) {
      if (dto.role) {
        const byRole = await this.prisma.accessProfile.findUnique({ where: { systemKey: dto.role } });
        if (!byRole) throw new BadRequestException("Perfil de sistema não encontrado para o papel informado.");
        profileIds = [byRole.id];
      } else if (dto._existingProfileIds?.length) {
        profileIds = dto._existingProfileIds;
      } else {
        throw new BadRequestException("Vincule ao menos um perfil de acesso.");
      }
    }
    profileIds = [...new Set(profileIds)];

    const profiles = await this.prisma.accessProfile.findMany({
      where: { id: { in: profileIds } }
    });
    if (profiles.length !== profileIds.length) {
      throw new BadRequestException("Um ou mais perfis informados são inválidos.");
    }
    if (profiles.some((p) => !p.active)) {
      throw new BadRequestException("Não é possível vincular um perfil inativo.");
    }

    const defaultProfileId =
      (dto.defaultProfileId && profileIds.includes(dto.defaultProfileId) ? dto.defaultProfileId : null) ??
      profileIds[0]!;

    const defaultProfile = profiles.find((p) => p.id === defaultProfileId)!;
    if (profiles.some((p) => p.systemKey === "EXTERNAL")) {
      throw new BadRequestException(
        "O perfil «Usuário externo» não pode ser combinado com perfis internos. Cadastre a conta como tipo Externo."
      );
    }
    const legacyRole: UserRole =
      defaultProfile.systemKey === "ADMIN" ||
      defaultProfile.systemKey === "EDITOR" ||
      defaultProfile.systemKey === "VIEWER"
        ? defaultProfile.systemKey
        : dto.role ?? UserRole.EDITOR;

    const allOrganizations =
      dto.allOrganizations !== undefined
        ? dto.allOrganizations
        : dto._existingAllOrganizations !== undefined
          ? dto._existingAllOrganizations
          : false;

    let organizationIds = dto.organizationIds;
    if (organizationIds === undefined) {
      if (dto.organizationId) {
        organizationIds = [dto.organizationId];
      } else if (dto._existingOrgIds) {
        organizationIds = dto._existingOrgIds;
      } else {
        organizationIds = [];
      }
    }
    organizationIds = [...new Set(organizationIds.filter(Boolean))];

    if (!allOrganizations && organizationIds.length === 0) {
      throw new BadRequestException("Vincule ao menos um órgão ou marque «Todos os órgãos».");
    }

    if (organizationIds.length > 0) {
      const orgs = await this.prisma.organization.findMany({
        where: { id: { in: organizationIds } },
        select: { id: true, active: true }
      });
      if (orgs.length !== organizationIds.length) {
        throw new BadRequestException("Um ou mais órgãos informados são inválidos.");
      }
    }

    const defaultOrganizationId =
      dto.defaultOrganizationId === null
        ? allOrganizations
          ? null
          : organizationIds[0] ?? null
        : dto.defaultOrganizationId && organizationIds.includes(dto.defaultOrganizationId)
          ? dto.defaultOrganizationId
          : allOrganizations
            ? null
            : organizationIds[0] ?? null;

    const primaryOrganizationId = defaultOrganizationId ?? organizationIds[0] ?? null;

    return {
      profileIds,
      organizationIds,
      allOrganizations,
      defaultProfileId,
      defaultOrganizationId,
      primaryOrganizationId,
      legacyRole
    };
  }

  private async wouldRemoveLastCapableAdmin(
    userId: string,
    next: { approvalStatus: UserApprovalStatus; profileIds?: string[] }
  ): Promise<boolean> {
    if (next.approvalStatus !== UserApprovalStatus.APPROVED && next.profileIds === undefined) {
      // só mudando aprovação para não-aprovado
    }
    const roleRows = await this.prisma.rolePermission.findMany({
      where: { granted: true, permissionKey: { in: [...REQUIRED_ADMIN_KEYS] } },
      select: { profileId: true, permissionKey: true }
    });
    const profileHas = new Map<string, Set<string>>();
    for (const row of roleRows) {
      const set = profileHas.get(row.profileId) ?? new Set();
      set.add(row.permissionKey);
      profileHas.set(row.profileId, set);
    }
    const capableProfileIds = [...profileHas.entries()]
      .filter(([, keys]) => REQUIRED_ADMIN_KEYS.every((k) => keys.has(k)))
      .map(([id]) => id);

    const users = await this.prisma.user.findMany({
      where: { approvalStatus: UserApprovalStatus.APPROVED },
      select: {
        id: true,
        accessProfiles: { select: { profileId: true } },
        extraPermissions: {
          where: { granted: true, permissionKey: { in: [...REQUIRED_ADMIN_KEYS] } },
          select: { profileId: true, permissionKey: true }
        }
      }
    });

    const isCapable = (u: (typeof users)[number], profileIds: string[]) =>
      profileIds.some((profileId) => {
        const inherited = profileHas.get(profileId) ?? new Set();
        const extras = u.extraPermissions
          .filter((p) => p.profileId === profileId)
          .map((p) => p.permissionKey);
        const effective = new Set([...inherited, ...extras]);
        return REQUIRED_ADMIN_KEYS.every((k) => effective.has(k)) || capableProfileIds.includes(profileId);
      });

    const capableAfter = users.filter((u) => {
      if (u.id === userId) {
        if (next.approvalStatus !== UserApprovalStatus.APPROVED) return false;
        const profiles = next.profileIds ?? u.accessProfiles.map((l) => l.profileId);
        return isCapable(u, profiles);
      }
      return isCapable(
        u,
        u.accessProfiles.map((l) => l.profileId)
      );
    });

    return capableAfter.length === 0;
  }
}
