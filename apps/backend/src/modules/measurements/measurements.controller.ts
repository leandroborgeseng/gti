import {
  Body,
  Controller,
  Delete,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { AddMeasurementItemsDto, CreateMeasurementDto } from "./measurements.dto";
import { MeasurementsService } from "./measurements.service";

function uploadMaxBytes(): number {
  const n = Number(process.env.UPLOAD_MAX_MB ?? "10");
  return (Number.isFinite(n) && n > 0 ? n : 10) * 1024 * 1024;
}

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

  @Post(":id/items")
  addItems(@Param("id") id: string, @Body() dto: AddMeasurementItemsDto): Promise<unknown> {
    return this.service.addItems(id, dto.items);
  }

  @Delete(":id/items/:itemId")
  removeItem(@Param("id") id: string, @Param("itemId") itemId: string): Promise<unknown> {
    return this.service.removeItem(id, itemId);
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
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: uploadMaxBytes() + 1024 }
    })
  )
  addAttachment(
    @Param("id") id: string,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [new MaxFileSizeValidator({ maxSize: uploadMaxBytes() })]
      })
    )
    file: Express.Multer.File
  ): Promise<unknown> {
    return this.service.addAttachmentUpload(id, file);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.service.findOne(id);
  }
}
