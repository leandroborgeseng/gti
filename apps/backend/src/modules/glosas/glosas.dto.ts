import { GlosaType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateGlosaDto {
  @IsString()
  @IsNotEmpty()
  measurementId!: string;

  @IsEnum(GlosaType)
  type!: GlosaType;

  @IsNumber()
  @Min(0.01)
  value!: number;

  @IsString()
  @IsNotEmpty()
  justification!: string;

  @IsOptional()
  @IsString()
  createdBy?: string;
}
