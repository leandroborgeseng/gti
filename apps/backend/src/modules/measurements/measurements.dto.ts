import { GlosaType, MeasurementItemType } from "@prisma/client";
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class MeasurementItemDto {
  @IsEnum(MeasurementItemType)
  type!: MeasurementItemType;

  @IsString()
  @IsNotEmpty()
  referenceId!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  pricingItemId?: string;
}

export class CreateMeasurementDto {
  @IsString()
  @IsNotEmpty()
  contractId!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  referenceMonth!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  referenceYear!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeasurementItemDto)
  items?: MeasurementItemDto[];
}

export class AddMeasurementItemsDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Informe pelo menos uma linha" })
  @ValidateNested({ each: true })
  @Type(() => MeasurementItemDto)
  items!: MeasurementItemDto[];
}

export class PatchMeasurementItemDto {
  @Type(() => Number)
  @IsNumber({}, { message: "Quantidade inválida" })
  @Min(0, { message: "A quantidade não pode ser negativa" })
  quantity!: number;
}

export class AddMeasurementGlosaDto {
  @IsEnum(GlosaType)
  type!: GlosaType;

  @Type(() => Number)
  @IsNumber({}, { message: "Valor inválido" })
  @Min(0.01, { message: "O valor da glosa deve ser maior que zero" })
  value!: number;

  @IsString()
  @IsNotEmpty({ message: "Glosa manual exige justificativa" })
  justification!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  measurementItemId?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;
}
