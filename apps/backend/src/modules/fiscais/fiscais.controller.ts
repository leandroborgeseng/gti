import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CreateFiscalDto, UpdateFiscalDto } from "./fiscais.dto";
import { FiscaisService } from "./fiscais.service";

@Controller("fiscais")
export class FiscaisController {
  constructor(private readonly service: FiscaisService) {}

  @Post()
  create(@Body() dto: CreateFiscalDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Get()
  findAll(): Promise<unknown> {
    return this.service.findAll();
  }

  @Get("user-options")
  findUserOptions(): Promise<unknown> {
    return this.service.findUserOptions();
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateFiscalDto): Promise<unknown> {
    return this.service.update(id, dto);
  }
}
