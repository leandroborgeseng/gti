import {
  Body,
  Controller,
  Delete,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { ImportProjectDto, UpdateProjectTaskDto } from "./projects.dto";
import { ProjectsService } from "./projects.service";

function uploadMaxBytes(): number {
  const n = Number(process.env.UPLOAD_MAX_MB ?? "10");
  return (Number.isFinite(n) && n > 0 ? n : 10) * 1024 * 1024;
}

@Controller("projects")
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get()
  findAll(): Promise<unknown> {
    return this.service.findAll();
  }

  /** Segmento literal antes de `:id` para evitar ambiguidade com palavras reservadas em URLs. */
  @Post("monday-import")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  importMonday(@Body() dto: ImportProjectDto): Promise<unknown> {
    return this.service.importFromMonday(dto as unknown);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  delete(@Param("id") id: string): Promise<unknown> {
    return this.service.delete(id);
  }

  @Patch(":id/tasks/:taskId")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  updateTask(
    @Param("id") projectId: string,
    @Param("taskId") taskId: string,
    @Body() dto: UpdateProjectTaskDto
  ): Promise<unknown> {
    return this.service.updateTask(projectId, taskId, dto);
  }

  @Post(":id/tasks/:taskId/attachments")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: uploadMaxBytes() + 1024 }
    })
  )
  addTaskAttachment(
    @Param("id") projectId: string,
    @Param("taskId") taskId: string,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [new MaxFileSizeValidator({ maxSize: uploadMaxBytes() })]
      })
    )
    file: Express.Multer.File
  ): Promise<unknown> {
    return this.service.addTaskAttachment(projectId, taskId, file);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.service.findOne(id);
  }
}
