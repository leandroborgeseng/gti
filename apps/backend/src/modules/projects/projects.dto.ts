import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

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
