import { ContractStatus, ContractType, LawType } from "@prisma/client";
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateContractDto {
  @IsString()
  @IsNotEmpty()
  number!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @IsString()
  @IsNotEmpty()
  cnpj!: string;

  @IsEnum(ContractType)
  contractType!: ContractType;

  @IsEnum(LawType)
  lawType!: LawType;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsNumber()
  @Min(0)
  totalValue!: number;

  @IsNumber()
  @Min(0)
  monthlyValue!: number;

  @IsEnum(ContractStatus)
  status!: ContractStatus;

  @IsOptional()
  @IsNumber()
  slaTarget?: number;

  @IsString()
  fiscalId!: string;

  @IsString()
  managerId!: string;

  @IsOptional()
  @IsString()
  supplierId?: string;
}

export class UpdateContractDto extends CreateContractDto {}
