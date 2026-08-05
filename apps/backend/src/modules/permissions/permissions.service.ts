import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { getAuditActorId, requestActorStore } from "../../common/audit-actor";
import { normalizeCatalogName } from "../../common/text-normalize";
import { PrismaService } from "../../prisma/prisma.service";
import { ALL_PERMISSION_KEYS, isValidPermissionKey, isValidUserRole, PERMISSION_CATALOG } from "./permission-catalog";

const REQUIRED_ADMIN_PERMISSION_KEYS = ["admin.users.manage", "admin.permissions.manage"] as const;

export type AccessProfileRecord = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  systemKey: string | null;
  protected: boolean;
  createdAt: Date;
  updatedAt: Date;
  userCount: number;
};

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  listCatalog() {
    return { modules: PERMISSION_CATALOG, keys: ALL_PERMISSION_KEYS };
  }

  async listProfiles(opts?: { includeInactive?: boolean }): Promise<AccessProfileRecord[]> {
    const rows = await this.prisma.accessProfile.findMany({
      where: opts?.includeInactive ? undefined : { active: true },
      orderBy: [{ protected: "desc" }, { name: "asc" }],
      include: { _count: { select: { userLinks: true } } }
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      active: r.active,
      systemKey: r.systemKey,
      protected: r.protected,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      userCount: r._count.userLinks
    }));
  }

  async createProfile(dto: { name: string; description?: string | null }): Promise<AccessProfileRecord> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("Informe o nome do perfil.");
    const nameNormalized = normalizeCatalogName(name);
    const exists = await this.prisma.accessProfile.findUnique({ where: { nameNormalized } });
    if (exists) throw new BadRequestException("Já existe um perfil com este nome.");
    const created = await this.prisma.accessProfile.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        nameNormalized,
        active: true,
        protected: false,
        systemKey: null
      },
      include: { _count: { select: { userLinks: true } } }
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "AccessProfile",
        entityId: created.id,
        action: "CREATE",
        userId: getAuditActorId(),
        newData: { name: created.name, description: created.description } as Prisma.InputJsonValue
      }
    });
    return {
      id: created.id,
      name: created.name,
      description: created.description,
      active: created.active,
      systemKey: created.systemKey,
      protected: created.protected,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      userCount: created._count.userLinks
    };
  }

  async updateProfile(
    id: string,
    dto: { name?: string; description?: string | null; active?: boolean }
  ): Promise<AccessProfileRecord> {
    const prev = await this.prisma.accessProfile.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException("Perfil não encontrado.");
    if (prev.protected && dto.active === false) {
      throw new BadRequestException("Não é possível inativar um perfil de sistema protegido.");
    }
    let name = prev.name;
    let nameNormalized = prev.nameNormalized;
    if (dto.name !== undefined) {
      name = dto.name.trim();
      if (!name) throw new BadRequestException("Informe o nome do perfil.");
      if (prev.protected && nameNormalized !== normalizeCatalogName(name) && prev.systemKey) {
        // permite renomear rótulo dos protegidos, mas não systemKey
      }
      nameNormalized = normalizeCatalogName(name);
      const conflict = await this.prisma.accessProfile.findFirst({
        where: { nameNormalized, id: { not: id } }
      });
      if (conflict) throw new BadRequestException("Já existe um perfil com este nome.");
    }
    const updated = await this.prisma.accessProfile.update({
      where: { id },
      data: {
        name,
        nameNormalized,
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        active: dto.active
      },
      include: { _count: { select: { userLinks: true } } }
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "AccessProfile",
        entityId: id,
        action: "UPDATE",
        userId: getAuditActorId(),
        oldData: { name: prev.name, description: prev.description, active: prev.active } as Prisma.InputJsonValue,
        newData: {
          name: updated.name,
          description: updated.description,
          active: updated.active
        } as Prisma.InputJsonValue
      }
    });
    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      active: updated.active,
      systemKey: updated.systemKey,
      protected: updated.protected,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      userCount: updated._count.userLinks
    };
  }

  async deleteProfile(id: string): Promise<{ ok: true }> {
    const prev = await this.prisma.accessProfile.findUnique({
      where: { id },
      include: { _count: { select: { userLinks: true } } }
    });
    if (!prev) throw new NotFoundException("Perfil não encontrado.");
    if (prev.protected) {
      throw new BadRequestException("Não é possível excluir um perfil de sistema protegido.");
    }
    if (prev._count.userLinks > 0) {
      throw new BadRequestException("Não é possível excluir um perfil em uso. Inative-o.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { profileId: id } });
      await tx.accessProfile.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          entity: "AccessProfile",
          entityId: id,
          action: "DELETE",
          userId: getAuditActorId(),
          oldData: { name: prev.name } as Prisma.InputJsonValue
        }
      });
    });
    return { ok: true };
  }

  async getProfilePermissions(profileId: string): Promise<{ profileId: string; keys: string[] }> {
    await this.ensureProfile(profileId);
    const rows = await this.prisma.rolePermission.findMany({
      where: { profileId, granted: true },
      select: { permissionKey: true }
    });
    return { profileId, keys: rows.map((r) => r.permissionKey).sort() };
  }

  async setProfilePermissions(profileId: string, keys: string[]): Promise<{ profileId: string; keys: string[] }> {
    const profile = await this.ensureProfile(profileId);
    const unique = [...new Set(keys)];
    for (const key of unique) {
      if (!isValidPermissionKey(key)) {
        throw new BadRequestException(`Permissão inválida: ${key}`);
      }
    }
    if (
      profile.systemKey === "ADMIN" &&
      !REQUIRED_ADMIN_PERMISSION_KEYS.every((requiredKey) => unique.includes(requiredKey))
    ) {
      throw new BadRequestException(
        "O perfil Administrador deve manter permissões para gerir usuários e permissões."
      );
    }
    await this.prisma.$transaction(async (tx) => {
      if (profile.systemKey === "ADMIN") {
        const capable = await this.countCapableAdmins(tx, {
          profileId,
          profileKeys: unique
        });
        if (capable === 0) {
          throw new ForbiddenException(
            "A alteração deixaria o sistema sem administrador capaz de gerir usuários e permissões."
          );
        }
      }
      const oldRows = await tx.rolePermission.findMany({
        where: { profileId, granted: true },
        select: { permissionKey: true }
      });
      await tx.rolePermission.deleteMany({ where: { profileId } });
      const role = this.systemKeyAsRole(profile.systemKey);
      if (unique.length > 0) {
        await tx.rolePermission.createMany({
          data: unique.map((permissionKey) => ({
            profileId,
            role,
            permissionKey,
            granted: true
          }))
        });
      }
      await tx.auditLog.create({
        data: {
          entity: "RolePermission",
          entityId: profileId,
          action: "REPLACE",
          userId: getAuditActorId(),
          oldData: { keys: oldRows.map((row) => row.permissionKey).sort() } as Prisma.InputJsonValue,
          newData: { keys: unique.sort() } as Prisma.InputJsonValue
        }
      });
    });
    return this.getProfilePermissions(profileId);
  }

  /** Compat: matriz por enum UserRole (systemKey). */
  async getRolePermissions(role: UserRole): Promise<{ role: UserRole; keys: string[] }> {
    const profile = await this.prisma.accessProfile.findUnique({ where: { systemKey: role } });
    if (!profile) return { role, keys: [] };
    const { keys } = await this.getProfilePermissions(profile.id);
    return { role, keys };
  }

  async setRolePermissions(role: UserRole, keys: string[]): Promise<{ role: UserRole; keys: string[] }> {
    const profile = await this.prisma.accessProfile.findUnique({ where: { systemKey: role } });
    if (!profile) throw new NotFoundException("Perfil de sistema não encontrado.");
    await this.setProfilePermissions(profile.id, keys);
    return this.getRolePermissions(role);
  }

  async getUserPermissions(
    userId: string,
    profileId?: string
  ): Promise<{ userId: string; profileId: string; keys: string[]; inheritedKeys: string[]; effectiveKeys: string[] }> {
    await this.ensureUser(userId);
    const resolvedProfileId = profileId ?? (await this.defaultProfileIdForUser(userId));
    await this.ensureUserHasProfile(userId, resolvedProfileId);
    const [extras, inherited] = await Promise.all([
      this.prisma.userPermission.findMany({
        where: { userId, profileId: resolvedProfileId, granted: true },
        select: { permissionKey: true }
      }),
      this.prisma.rolePermission.findMany({
        where: { profileId: resolvedProfileId, granted: true },
        select: { permissionKey: true }
      })
    ]);
    const keys = extras.map((r) => r.permissionKey).sort();
    const inheritedKeys = inherited.map((r) => r.permissionKey).sort();
    const effectiveKeys = [...new Set([...inheritedKeys, ...keys])].sort();
    return { userId, profileId: resolvedProfileId, keys, inheritedKeys, effectiveKeys };
  }

  async setUserExtraPermissions(
    userId: string,
    keys: string[],
    profileId?: string
  ): Promise<{ userId: string; profileId: string; keys: string[] }> {
    const unique = [...new Set(keys)];
    for (const key of unique) {
      if (!isValidPermissionKey(key)) {
        throw new BadRequestException(`Permissão inválida: ${key}`);
      }
    }
    const resolvedProfileId = profileId ?? (await this.defaultProfileIdForUser(userId));
    await this.ensureUserHasProfile(userId, resolvedProfileId);

    await this.prisma.$transaction(async (tx) => {
      const capable = await this.countCapableAdmins(tx, {
        userId,
        profileId: resolvedProfileId,
        extraKeys: unique
      });
      if (capable === 0) {
        throw new ForbiddenException(
          "A alteração deixaria o sistema sem administrador aprovado com permissões para gerir usuários e permissões."
        );
      }

      const oldRows = await tx.userPermission.findMany({
        where: { userId, profileId: resolvedProfileId, granted: true },
        select: { permissionKey: true }
      });
      await tx.userPermission.deleteMany({ where: { userId, profileId: resolvedProfileId } });
      if (unique.length > 0) {
        await tx.userPermission.createMany({
          data: unique.map((permissionKey) => ({
            userId,
            profileId: resolvedProfileId,
            permissionKey,
            granted: true
          }))
        });
      }
      await tx.auditLog.create({
        data: {
          entity: "UserPermission",
          entityId: `${userId}:${resolvedProfileId}`,
          action: "REPLACE",
          userId: getAuditActorId(),
          oldData: { keys: oldRows.map((row) => row.permissionKey).sort(), profileId: resolvedProfileId } as Prisma.InputJsonValue,
          newData: { keys: unique.sort(), profileId: resolvedProfileId } as Prisma.InputJsonValue
        }
      });
    });
    const result = await this.getUserPermissions(userId, resolvedProfileId);
    return { userId, profileId: resolvedProfileId, keys: result.keys };
  }

  async listRolePermissionHistory(role: UserRole) {
    const profile = await this.prisma.accessProfile.findUnique({ where: { systemKey: role } });
    if (!profile) return [];
    return this.listProfilePermissionHistory(profile.id);
  }

  async listProfilePermissionHistory(profileId: string) {
    await this.ensureProfile(profileId);
    return this.prisma.auditLog.findMany({
      where: { entity: "RolePermission", entityId: profileId },
      orderBy: { timestamp: "desc" },
      take: 50
    });
  }

  async listUserPermissionHistory(userId: string) {
    await this.ensureUser(userId);
    return this.prisma.auditLog.findMany({
      where: { entity: "UserPermission", entityId: { startsWith: userId } },
      orderBy: { timestamp: "desc" },
      take: 50
    });
  }

  async resolveEffectivePermissions(
    userId: string,
    activeProfileId?: string | null
  ): Promise<{ userId: string; role: UserRole; profileId: string; keys: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        lastActiveProfileId: true,
        defaultProfileId: true,
        accessProfiles: {
          where: { profile: { active: true } },
          select: { profileId: true, isDefault: true, profile: { select: { systemKey: true } } }
        }
      }
    });
    if (!user) throw new NotFoundException("Usuário não encontrado.");

    const actorProfile = activeProfileId ?? requestActorStore.getStore()?.profileId ?? null;
    let profileId =
      actorProfile && user.accessProfiles.some((l) => l.profileId === actorProfile)
        ? actorProfile
        : user.lastActiveProfileId && user.accessProfiles.some((l) => l.profileId === user.lastActiveProfileId)
          ? user.lastActiveProfileId
          : user.defaultProfileId && user.accessProfiles.some((l) => l.profileId === user.defaultProfileId)
            ? user.defaultProfileId
            : user.accessProfiles.find((l) => l.isDefault)?.profileId ?? user.accessProfiles[0]?.profileId;

    if (!profileId) {
      // Fallback legado: perfil pelo role
      const byRole = await this.prisma.accessProfile.findUnique({ where: { systemKey: user.role } });
      if (!byRole) {
        return { userId, role: user.role, profileId: "", keys: [] };
      }
      profileId = byRole.id;
    }

    const [rolePerms, userPerms] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { profileId, granted: true },
        select: { permissionKey: true }
      }),
      this.prisma.userPermission.findMany({
        where: { userId, profileId, granted: true },
        select: { permissionKey: true }
      })
    ]);
    const link = user.accessProfiles.find((l) => l.profileId === profileId);
    const role = (link?.profile.systemKey as UserRole | null) ?? user.role;
    const keys = [...new Set([...rolePerms.map((r) => r.permissionKey), ...userPerms.map((r) => r.permissionKey)])].sort();
    return { userId, role, profileId, keys };
  }

  async hasPermission(userId: string, key: string): Promise<boolean> {
    const { keys } = await this.resolveEffectivePermissions(userId);
    return keys.includes(key);
  }

  async assertHasPermission(userId: string, key: string): Promise<void> {
    if (!(await this.hasPermission(userId, key))) {
      throw new ForbiddenException("Sem permissão para esta operação");
    }
  }

  parseRoleParam(role: string): UserRole {
    if (!isValidUserRole(role)) {
      throw new BadRequestException("Papel inválido.");
    }
    return role;
  }

  private async ensureUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
  }

  private async ensureProfile(profileId: string) {
    const profile = await this.prisma.accessProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException("Perfil não encontrado.");
    return profile;
  }

  private async ensureUserHasProfile(userId: string, profileId: string): Promise<void> {
    const link = await this.prisma.userAccessProfile.findUnique({
      where: { userId_profileId: { userId, profileId } }
    });
    if (!link) throw new BadRequestException("O usuário não possui este perfil vinculado.");
  }

  private async defaultProfileIdForUser(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        defaultProfileId: true,
        lastActiveProfileId: true,
        role: true,
        accessProfiles: { select: { profileId: true, isDefault: true }, take: 20 }
      }
    });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    const id =
      user.defaultProfileId ??
      user.accessProfiles.find((l) => l.isDefault)?.profileId ??
      user.lastActiveProfileId ??
      user.accessProfiles[0]?.profileId;
    if (id) return id;
    const byRole = await this.prisma.accessProfile.findUnique({ where: { systemKey: user.role } });
    if (!byRole) throw new BadRequestException("Usuário sem perfil vinculado.");
    return byRole.id;
  }

  private systemKeyAsRole(systemKey: string | null): UserRole {
    if (systemKey === "ADMIN" || systemKey === "EDITOR" || systemKey === "VIEWER") return systemKey;
    return UserRole.EDITOR;
  }

  /**
   * Conta usuários aprovados capazes de admin.users.manage + admin.permissions.manage
   * via algum perfil vinculado (herdado ∪ extras).
   */
  private async countCapableAdmins(
    tx: Prisma.TransactionClient,
    override?: {
      userId?: string;
      profileId?: string;
      profileKeys?: string[];
      extraKeys?: string[];
    }
  ): Promise<number> {
    const roleRows = await tx.rolePermission.findMany({
      where: { granted: true },
      select: { profileId: true, permissionKey: true }
    });
    const profileKeys = new Map<string, Set<string>>();
    for (const row of roleRows) {
      const set = profileKeys.get(row.profileId) ?? new Set();
      set.add(row.permissionKey);
      profileKeys.set(row.profileId, set);
    }
    if (override?.profileId && override.profileKeys) {
      profileKeys.set(override.profileId, new Set(override.profileKeys));
    }

    const users = await tx.user.findMany({
      where: { approvalStatus: "APPROVED" },
      select: {
        id: true,
        accessProfiles: { select: { profileId: true } },
        extraPermissions: {
          where: { granted: true },
          select: { profileId: true, permissionKey: true }
        }
      }
    });

    return users.filter((u) =>
      u.accessProfiles.some((link) => {
        const inherited = profileKeys.get(link.profileId) ?? new Set<string>();
        const extras =
          override?.userId === u.id && override.profileId === link.profileId && override.extraKeys
            ? override.extraKeys
            : u.extraPermissions.filter((p) => p.profileId === link.profileId).map((p) => p.permissionKey);
        const effective = new Set([...inherited, ...extras]);
        return REQUIRED_ADMIN_PERMISSION_KEYS.every((k) => effective.has(k));
      })
    ).length;
  }
}
