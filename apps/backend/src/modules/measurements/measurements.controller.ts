import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CreateMeasurementDto } from "./measurements.dto";
import { MeasurementsService } from "./measurements.service";

@Controller("measurements")
export class MeasurementsController {
  constructor(private readonly service: MeasurementsService) {}

  @Post()
  create(@Body() dto: CreateMeasurementDto): Promise<unknown> {
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

  @Post(":id/calculate")
  calculate(@Param("id") id: string): Promise<unknown> {
    return this.service.calculate(id);
  }

  @Post(":id/approve")
  approve(@Param("id") id: string): Promise<unknown> {
    return this.service.approve(id);
  }

  @Post(":id/attachments")
  addAttachment(
    @Param("id") id: string,
    @Body() payload: { fileName: string; mimeType: string; filePath: string }
  ): Promise<unknown> {
    return this.service.addAttachment(id, payload);
  }
}
