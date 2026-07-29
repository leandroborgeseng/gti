import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { PermissionsService } from "./permissions.service";

class SetPermissionsBodyDto {
  keys!: string[];
}

@Controller("permissions")
@Roles(UserRole.ADMIN)
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Get("catalog")
  listCatalog(): unknown {
    return this.service.listCatalog();
  }

  @Get("role/:role")
  getRolePermissions(@Param("role") role: string): Promise<unknown> {
    return this.service.getRolePermissions(this.service.parseRoleParam(role));
  }

  @Put("role/:role")
  setRolePermissions(@Param("role") role: string, @Body() body: SetPermissionsBodyDto): Promise<unknown> {
    return this.service.setRolePermissions(this.service.parseRoleParam(role), body.keys ?? []);
  }

  @Get("user/:userId")
  getUserPermissions(@Param("userId") userId: string): Promise<unknown> {
    return this.service.getUserPermissions(userId);
  }

  @Put("user/:userId")
  setUserExtraPermissions(@Param("userId") userId: string, @Body() body: SetPermissionsBodyDto): Promise<unknown> {
    return this.service.setUserExtraPermissions(userId, body.keys ?? []);
  }
}
