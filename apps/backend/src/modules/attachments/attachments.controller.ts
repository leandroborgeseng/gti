import { Controller, Get, Param, StreamableFile } from "@nestjs/common";
import { AttachmentsService } from "./attachments.service";

@Controller("attachments")
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Get(":id/download")
  download(@Param("id") id: string): Promise<StreamableFile> {
    return this.service.downloadFile(id);
  }
}
