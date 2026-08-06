import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CreateSupplierDto, UpdateSupplierDto } from "./suppliers.dto";
import { SuppliersService } from "./suppliers.service";

@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Post()
  create(@Body() dto: CreateSupplierDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateSupplierDto): Promise<unknown> {
    return this.service.update(id, dto);
  }

  @Get()
  findAll(): Promise<unknown> {
    return this.service.findAll();
  }
}
