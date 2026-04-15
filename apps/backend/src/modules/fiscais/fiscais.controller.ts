import { Body, Controller, Get, Post } from "@nestjs/common";
import { CreateFiscalDto } from "./fiscais.dto";
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
}
