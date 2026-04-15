import { GoalActionStatus, GoalLinkType, GoalStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateGoalDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @IsEnum(GoalStatus)
  status!: GoalStatus;

  @IsString()
  @IsNotEmpty()
  priority!: string;

  @IsString()
  @IsNotEmpty()
  responsibleId!: string;
}

export class UpdateGoalDto extends CreateGoalDto {}

export class CreateGoalActionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(GoalActionStatus)
  status!: GoalActionStatus;

  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsString()
  @IsNotEmpty()
  responsibleId!: string;
}

export class UpdateGoalActionDto extends CreateGoalActionDto {}

export class LinkGoalDto {
  @IsEnum(GoalLinkType)
  type!: GoalLinkType;

  @IsString()
  @IsNotEmpty()
  referenceId!: string;
}

export class ManualProgressDto {
  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number;
}
