import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CreateGlosaDto } from "./glosas.dto";
import { GlosasService } from "./glosas.service";

@Controller("glosas")
export class GlosasController {
  constructor(private readonly service: GlosasService) {}

  @Post()
  create(@Body() dto: CreateGlosaDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Get()
  findAll(): Promise<unknown> {
    return this.service.findAll();
  }

  @Post(":id/attachments")
  addAttachment(
    @Body() payload: { fileName: string; mimeType: string; filePath: string },
    @Param("id") id: string
  ): Promise<unknown> {
    return this.service.addAttachment(id, payload);
  }
}
