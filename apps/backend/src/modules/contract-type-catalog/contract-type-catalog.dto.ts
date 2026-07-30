import { ContractType } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateContractTypeCatalogDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  acronym!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsEnum(ContractType)
  legacyEnum?: ContractType;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateContractTypeCatalogDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  acronym?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsEnum(ContractType)
  legacyEnum?: ContractType | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
