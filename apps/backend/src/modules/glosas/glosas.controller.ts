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
import { CreateGlosaDto } from "./glosas.dto";
import { GlosasService } from "./glosas.service";

function uploadMaxBytes(): number {
  const n = Number(process.env.UPLOAD_MAX_MB ?? "10");
  return (Number.isFinite(n) && n > 0 ? n : 10) * 1024 * 1024;
}

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

  @Get(":id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.service.findOne(id);
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

  @Delete(":id/attachments/:attachmentId")
  removeAttachment(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string
  ): Promise<{ ok: true }> {
    return this.service.removeAttachment(id, attachmentId);
  }
}
