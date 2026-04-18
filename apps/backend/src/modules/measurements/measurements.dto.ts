import { MeasurementItemType } from "@prisma/client";
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
  @Min(0.0001, { message: "A quantidade deve ser maior que zero" })
  quantity!: number;
}
