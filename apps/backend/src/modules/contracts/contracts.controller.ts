import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { ContractsService } from "./contracts.service";
import { CreateContractDto, UpdateContractDto } from "./contracts.dto";

@Controller("contracts")
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Post()
  create(@Body() dto: CreateContractDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Get()
  findAll(): Promise<unknown> {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.service.findOne(id);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateContractDto): Promise<unknown> {
    return this.service.update(id, dto);
  }
}
