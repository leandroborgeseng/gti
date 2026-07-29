import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { CreateOrganizationDto, UpdateOrganizationDto } from "./organizations.dto";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  findAll(@Query("active") active?: string): Promise<unknown> {
    const filter =
      active === "true" ? { active: true } : active === "false" ? { active: false } : undefined;
    return this.service.findAll(filter);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateOrganizationDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateOrganizationDto): Promise<unknown> {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  delete(@Param("id") id: string): Promise<unknown> {
    return this.service.delete(id);
  }
}
