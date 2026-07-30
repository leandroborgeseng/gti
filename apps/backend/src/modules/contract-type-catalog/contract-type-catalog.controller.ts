import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { CreateContractTypeCatalogDto, UpdateContractTypeCatalogDto } from "./contract-type-catalog.dto";
import { ContractTypeCatalogService } from "./contract-type-catalog.service";

@Controller("contract-type-catalog")
@Roles(UserRole.ADMIN)
export class ContractTypeCatalogController {
  constructor(private readonly service: ContractTypeCatalogService) {}

  @Get()
  findAll(@Query("active") active?: string): Promise<unknown> {
    const filter =
      active === "true" ? { active: true } : active === "false" ? { active: false } : undefined;
    return this.service.findAll(filter);
  }

  @Post()
  create(@Body() dto: CreateContractTypeCatalogDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateContractTypeCatalogDto): Promise<unknown> {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  delete(@Param("id") id: string): Promise<unknown> {
    return this.service.delete(id);
  }
}
