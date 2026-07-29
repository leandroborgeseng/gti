import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ALL_PERMISSION_KEYS, isValidPermissionKey, isValidUserRole, PERMISSION_CATALOG } from "./permission-catalog";

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
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { role } });
      if (unique.length > 0) {
        await tx.rolePermission.createMany({
          data: unique.map((permissionKey) => ({ role, permissionKey, granted: true }))
        });
      }
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
    await this.ensureUser(userId);
    const unique = [...new Set(keys)];
    for (const key of unique) {
      if (!isValidPermissionKey(key)) {
        throw new BadRequestException(`Permissão inválida: ${key}`);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId } });
      if (unique.length > 0) {
        await tx.userPermission.createMany({
          data: unique.map((permissionKey) => ({ userId, permissionKey, granted: true }))
        });
      }
    });
    return this.getUserPermissions(userId);
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
}
