import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { getAuditActorId } from "../../common/audit-actor";
import { PrismaService } from "../../prisma/prisma.service";
import { ALL_PERMISSION_KEYS, isValidPermissionKey, isValidUserRole, PERMISSION_CATALOG } from "./permission-catalog";

const REQUIRED_ADMIN_PERMISSION_KEYS = ["admin.users.manage", "admin.permissions.manage"] as const;

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  listCatalog() {
    return { modules: PERMISSION_CATALOG, keys: ALL_PERMISSION_KEYS };
  }

  async getRolePermissions(role: UserRole): Promise<{ role: UserRole; keys: string[] }> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { role, granted: true },
      select: { permissionKey: true }
    });
    return { role, keys: rows.map((r) => r.permissionKey).sort() };
  }

  async setRolePermissions(role: UserRole, keys: string[]): Promise<{ role: UserRole; keys: string[] }> {
    const unique = [...new Set(keys)];
    for (const key of unique) {
      if (!isValidPermissionKey(key)) {
        throw new BadRequestException(`Permissão inválida: ${key}`);
      }
    }
    if (
      role === UserRole.ADMIN &&
      !REQUIRED_ADMIN_PERMISSION_KEYS.every((requiredKey) => unique.includes(requiredKey))
    ) {
      throw new BadRequestException(
        "O papel Administrador deve manter permissões para gerir usuários e permissões."
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const oldRows = await tx.rolePermission.findMany({
        where: { role, granted: true },
        select: { permissionKey: true }
      });
      await tx.rolePermission.deleteMany({ where: { role } });
      if (unique.length > 0) {
        await tx.rolePermission.createMany({
          data: unique.map((permissionKey) => ({ role, permissionKey, granted: true }))
        });
      }
      await tx.auditLog.create({
        data: {
          entity: "RolePermission",
          entityId: role,
          action: "REPLACE",
          userId: getAuditActorId(),
          oldData: { keys: oldRows.map((row) => row.permissionKey).sort() } as Prisma.InputJsonValue,
          newData: { keys: unique.sort() } as Prisma.InputJsonValue
        }
      });
    });
    return this.getRolePermissions(role);
  }

  async getUserPermissions(userId: string): Promise<{ userId: string; keys: string[] }> {
    await this.ensureUser(userId);
    const rows = await this.prisma.userPermission.findMany({
      where: { userId, granted: true },
      select: { permissionKey: true }
    });
    return { userId, keys: rows.map((r) => r.permissionKey).sort() };
  }

  async setUserExtraPermissions(userId: string, keys: string[]): Promise<{ userId: string; keys: string[] }> {
    const unique = [...new Set(keys)];
    for (const key of unique) {
      if (!isValidPermissionKey(key)) {
        throw new BadRequestException(`Permissão inválida: ${key}`);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true }
      });
      if (!targetUser) throw new NotFoundException("Usuário não encontrado.");

      if (targetUser.role === UserRole.ADMIN) {
        const approvedAdminsWithAccess = await this.countApprovedAdminsWithRequiredPermissions(tx, {
          userId,
          extraKeys: unique
        });
        if (approvedAdminsWithAccess === 0) {
          throw new ForbiddenException(
            "A alteração deixaria o sistema sem administrador aprovado com permissões para gerir usuários e permissões."
          );
        }
      }

      const oldRows = await tx.userPermission.findMany({
        where: { userId, granted: true },
        select: { permissionKey: true }
      });
      await tx.userPermission.deleteMany({ where: { userId } });
      if (unique.length > 0) {
        await tx.userPermission.createMany({
          data: unique.map((permissionKey) => ({ userId, permissionKey, granted: true }))
        });
      }
      await tx.auditLog.create({
        data: {
          entity: "UserPermission",
          entityId: userId,
          action: "REPLACE",
          userId: getAuditActorId(),
          oldData: { keys: oldRows.map((row) => row.permissionKey).sort() } as Prisma.InputJsonValue,
          newData: { keys: unique.sort() } as Prisma.InputJsonValue
        }
      });
    });
    return this.getUserPermissions(userId);
  }

  async listRolePermissionHistory(role: UserRole) {
    return this.prisma.auditLog.findMany({
      where: { entity: "RolePermission", entityId: role },
      orderBy: { timestamp: "desc" },
      take: 50
    });
  }

  async listUserPermissionHistory(userId: string) {
    await this.ensureUser(userId);
    return this.prisma.auditLog.findMany({
      where: { entity: "UserPermission", entityId: userId },
      orderBy: { timestamp: "desc" },
      take: 50
    });
  }

  async resolveEffectivePermissions(userId: string): Promise<{ userId: string; role: UserRole; keys: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true }
    });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    const [rolePerms, userPerms] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { role: user.role, granted: true },
        select: { permissionKey: true }
      }),
      this.prisma.userPermission.findMany({
        where: { userId, granted: true },
        select: { permissionKey: true }
      })
    ]);
    const keys = [...new Set([...rolePerms.map((r) => r.permissionKey), ...userPerms.map((r) => r.permissionKey)])].sort();
    return { userId, role: user.role, keys };
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

  private async countApprovedAdminsWithRequiredPermissions(
    tx: Prisma.TransactionClient,
    override?: { userId: string; extraKeys: string[] }
  ): Promise<number> {
    const [rolePermissions, approvedAdmins] = await Promise.all([
      tx.rolePermission.findMany({
        where: { role: UserRole.ADMIN, granted: true },
        select: { permissionKey: true }
      }),
      tx.user.findMany({
        where: { role: UserRole.ADMIN, approvalStatus: "APPROVED" },
        select: {
          id: true,
          extraPermissions: {
            where: { granted: true },
            select: { permissionKey: true }
          }
        }
      })
    ]);
    const roleKeys = new Set(rolePermissions.map((permission) => permission.permissionKey));

    return approvedAdmins.filter((admin) => {
      const extraKeys =
        override?.userId === admin.id
          ? override.extraKeys
          : admin.extraPermissions.map((permission) => permission.permissionKey);
      const effectiveKeys = new Set([...roleKeys, ...extraKeys]);
      return REQUIRED_ADMIN_PERMISSION_KEYS.every((requiredKey) => effectiveKeys.has(requiredKey));
    }).length;
  }
}
