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
  Query,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import {
  BulkPatchProjectTasksDto,
  CreateProjectCollectionDto,
  CreateProjectDto,
  CreateProjectTaskDto,
  ImportProjectDto,
  UpdateProjectCollectionDto,
  UpdateProjectDto,
  UpdateProjectTaskDto
} from "./projects.dto";
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

  @Post()
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  create(@Body() dto: CreateProjectDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Get("dashboard")
  dashboard(): Promise<unknown> {
    return this.service.dashboardStats();
  }

  @Get("tasks")
  listTasksFlat(@Query() query: Record<string, string | string[] | undefined>): Promise<unknown> {
    return this.service.findAllTasksFlat(query);
  }

  @Get("groups")
  findGroups(): Promise<unknown> {
    return this.service.findCollections();
  }

  @Get("supervisors")
  findSupervisors(): Promise<unknown> {
    return this.service.findSupervisors();
  }

  @Post("groups")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  createGroup(@Body() dto: CreateProjectCollectionDto): Promise<unknown> {
    return this.service.createCollection(dto);
  }

  @Patch("groups/:groupId")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  updateGroup(@Param("groupId") groupId: string, @Body() dto: UpdateProjectCollectionDto): Promise<unknown> {
    return this.service.updateCollection(groupId, dto);
  }

  @Delete("groups/:groupId")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  deleteGroup(@Param("groupId") groupId: string): Promise<unknown> {
    return this.service.deleteCollection(groupId);
  }

  /** Segmento literal antes de `:id` para evitar ambiguidade com palavras reservadas em URLs. */
  @Post("monday-import")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  importMonday(@Body() dto: ImportProjectDto): Promise<unknown> {
    return this.service.importFromMonday(dto as unknown);
  }

  @Patch("tasks/bulk")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  bulkPatchTasks(@Body() dto: BulkPatchProjectTasksDto): Promise<unknown> {
    return this.service.bulkPatchTasks(dto);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  delete(@Param("id") id: string): Promise<unknown> {
    return this.service.delete(id);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  update(@Param("id") id: string, @Body() dto: UpdateProjectDto): Promise<unknown> {
    return this.service.update(id, dto);
  }

  @Post(":id/tasks")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  createTask(@Param("id") projectId: string, @Body() dto: CreateProjectTaskDto): Promise<unknown> {
    return this.service.createTask(projectId, dto);
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
