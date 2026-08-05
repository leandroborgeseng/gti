import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { PermissionsService } from "./permissions.service";

class SetPermissionsBodyDto {
  keys!: string[];
  profileId?: string;
}

class ProfileBodyDto {
  name!: string;
  description?: string | null;
  active?: boolean;
}

@Controller("permissions")
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Get("catalog")
  @Roles(UserRole.ADMIN)
  listCatalog(): unknown {
    return this.service.listCatalog();
  }

  @Get("profiles")
  @Roles(UserRole.ADMIN)
  listProfiles(@Query("includeInactive") includeInactive?: string): Promise<unknown> {
    return this.service.listProfiles({ includeInactive: includeInactive === "true" });
  }

  @Post("profiles")
  @Roles(UserRole.ADMIN)
  createProfile(@Body() body: ProfileBodyDto): Promise<unknown> {
    return this.service.createProfile(body);
  }

  @Patch("profiles/:id")
  @Roles(UserRole.ADMIN)
  updateProfile(@Param("id") id: string, @Body() body: ProfileBodyDto): Promise<unknown> {
    return this.service.updateProfile(id, body);
  }

  @Delete("profiles/:id")
  @Roles(UserRole.ADMIN)
  deleteProfile(@Param("id") id: string): Promise<unknown> {
    return this.service.deleteProfile(id);
  }

  @Get("profile/:profileId")
  @Roles(UserRole.ADMIN)
  getProfilePermissions(@Param("profileId") profileId: string): Promise<unknown> {
    return this.service.getProfilePermissions(profileId);
  }

  @Put("profile/:profileId")
  @Roles(UserRole.ADMIN)
  setProfilePermissions(
    @Param("profileId") profileId: string,
    @Body() body: SetPermissionsBodyDto
  ): Promise<unknown> {
    return this.service.setProfilePermissions(profileId, body.keys ?? []);
  }

  @Get("profile/:profileId/history")
  @Roles(UserRole.ADMIN)
  listProfilePermissionHistory(@Param("profileId") profileId: string): Promise<unknown> {
    return this.service.listProfilePermissionHistory(profileId);
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
  getUserPermissions(
    @Param("userId") userId: string,
    @Query("profileId") profileId?: string
  ): Promise<unknown> {
    return this.service.getUserPermissions(userId, profileId);
  }

  @Put("user/:userId")
  @Roles(UserRole.ADMIN)
  setUserExtraPermissions(
    @Param("userId") userId: string,
    @Body() body: SetPermissionsBodyDto
  ): Promise<unknown> {
    return this.service.setUserExtraPermissions(userId, body.keys ?? [], body.profileId);
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
