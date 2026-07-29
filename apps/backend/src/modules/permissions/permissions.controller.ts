import { Body, Controller, Get, Param, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { PermissionsService } from "./permissions.service";

class SetPermissionsBodyDto {
  keys!: string[];
}

@Controller("permissions")
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Get("catalog")
  @Roles(UserRole.ADMIN)
  listCatalog(): unknown {
    return this.service.listCatalog();
  }

  @Get("role/:role")
  @Roles(UserRole.ADMIN)
  getRolePermissions(@Param("role") role: string): Promise<unknown> {
    return this.service.getRolePermissions(this.service.parseRoleParam(role));
  }

  @Put("role/:role")
  @Roles(UserRole.ADMIN)
  setRolePermissions(@Param("role") role: string, @Body() body: SetPermissionsBodyDto): Promise<unknown> {
    return this.service.setRolePermissions(this.service.parseRoleParam(role), body.keys ?? []);
  }

  @Get("role/:role/history")
  @Roles(UserRole.ADMIN)
  listRolePermissionHistory(@Param("role") role: string): Promise<unknown> {
    return this.service.listRolePermissionHistory(this.service.parseRoleParam(role));
  }

  @Get("user/:userId")
  @Roles(UserRole.ADMIN)
  getUserPermissions(@Param("userId") userId: string): Promise<unknown> {
    return this.service.getUserPermissions(userId);
  }

  @Put("user/:userId")
  @Roles(UserRole.ADMIN)
  setUserExtraPermissions(@Param("userId") userId: string, @Body() body: SetPermissionsBodyDto): Promise<unknown> {
    return this.service.setUserExtraPermissions(userId, body.keys ?? []);
  }

  @Get("user/:userId/history")
  @Roles(UserRole.ADMIN)
  listUserPermissionHistory(@Param("userId") userId: string): Promise<unknown> {
    return this.service.listUserPermissionHistory(userId);
  }

  @Get("me")
  getMyEffectivePermissions(
    @Req() req: Request & { user: { sub: string } }
  ): Promise<{ userId: string; role: UserRole; keys: string[] }> {
    return this.service.resolveEffectivePermissions(req.user.sub);
  }
}
