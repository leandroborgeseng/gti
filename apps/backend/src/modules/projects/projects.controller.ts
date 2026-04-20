import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { ImportProjectDto } from "./projects.dto";
import { ProjectsService } from "./projects.service";

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

  @Get(":id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.service.findOne(id);
  }
}
