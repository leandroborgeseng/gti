import { GlosaType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsNumber, IsString, Min } from "class-validator";

export class CreateGlosaDto {
  @IsString()
  @IsNotEmpty()
  measurementId!: string;

  @IsEnum(GlosaType)
  type!: GlosaType;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsString()
  @IsNotEmpty()
  justification!: string;

  @IsString()
  @IsNotEmpty()
  createdBy!: string;
}
