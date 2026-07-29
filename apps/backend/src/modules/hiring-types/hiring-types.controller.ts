import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { CreateHiringTypeDto, UpdateHiringTypeDto } from "./hiring-types.dto";
import { HiringTypesService } from "./hiring-types.service";

@Controller("hiring-types")
@Roles(UserRole.ADMIN)
export class HiringTypesController {
  constructor(private readonly service: HiringTypesService) {}

  @Get()
  findAll(@Query("active") active?: string): Promise<unknown> {
    const filter =
      active === "true" ? { active: true } : active === "false" ? { active: false } : undefined;
    return this.service.findAll(filter);
  }

  @Post()
  create(@Body() dto: CreateHiringTypeDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateHiringTypeDto): Promise<unknown> {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  delete(@Param("id") id: string): Promise<unknown> {
    return this.service.delete(id);
  }
}
