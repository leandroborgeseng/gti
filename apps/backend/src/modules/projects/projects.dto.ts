import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

/** Resposta de `GET /projects/dashboard` — métricas agregadas para a lista de projetos. */
export interface ProjectsDashboardStats {
  projectCount: number;
  groupCount: number;
  taskCount: number;
  rootTaskCount: number;
  subTaskCount: number;
  statusBreakdown: {
    done: number;
    progress: number;
    blocked: number;
    notStarted: number;
    other: number;
    empty: number;
  };
  overdueNotDoneCount: number;
  projectsWithOverdueCount: number;
  tasksWithoutDueDateNotDone: number;
}

/** Linha na listagem plana de tarefas (vários projetos). */
export interface ProjectFlatTaskRow {
  id: string;
  projectId: string;
  projectName: string;
  groupId: string;
  groupName: string;
  parentTaskId: string | null;
  title: string;
  status: string;
  statusKind: "done" | "progress" | "blocked" | "notStarted" | "other" | "empty";
  assigneeExternal: string | null;
  internalResponsible: string | null;
  dueDate: string | null;
  sortOrder: number;
}

export interface ProjectsTasksFlatResponse {
  items: ProjectFlatTaskRow[];
  total: number;
  limit: number;
  offset: number;
  /** Indica que existem mais linhas na BD do que o limite interno de leitura. */
  truncated: boolean;
}

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class UpdateProjectDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class BulkPatchProjectTasksItemDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @IsString()
  @IsNotEmpty()
  status!: string;
}

export class BulkPatchProjectTasksDto {
  @ValidateNested({ each: true })
  @Type(() => BulkPatchProjectTasksItemDto)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  items!: BulkPatchProjectTasksItemDto[];
}

/** Atualização parcial de uma tarefa de projeto (quadro Monday). */
export class UpdateProjectTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  assigneeExternal?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  internalResponsible?: string;

  /** ISO 8601 ou string vazia para limpar a data. */
  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  effort?: number;
}

/** Nó de tarefa (raiz ou subtarefa), recursivo. */
export class ImportProjectTaskNodeDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  assigneeExternal?: string;

  /** ISO 8601 ou null */
  @IsOptional()
  @IsString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  effort?: number | null;

  @IsOptional()
  @IsString()
  internalResponsible?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ImportProjectTaskNodeDto)
  @IsArray()
  children?: ImportProjectTaskNodeDto[];
}

export class ImportProjectGroupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ValidateNested({ each: true })
  @Type(() => ImportProjectTaskNodeDto)
  @IsArray()
  tasks!: ImportProjectTaskNodeDto[];
}

/** Payload após preview no cliente (Excel Monday.com). */
export class ImportProjectDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ValidateNested({ each: true })
  @Type(() => ImportProjectGroupDto)
  @IsArray()
  @ArrayMinSize(1)
  groups!: ImportProjectGroupDto[];
}
