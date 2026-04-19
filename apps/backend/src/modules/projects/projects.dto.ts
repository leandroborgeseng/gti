import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

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
