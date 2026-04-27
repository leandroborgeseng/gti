import {
  ContractFeatureStatus,
  ContractItemDeliveryStatus,
  ContractStatus,
  ContractType,
  LawType
} from "@prisma/client";

/** Linha validada para importação em massa de módulos/funcionalidades (planilha). */
export type ContractStructureImportRow = {
  moduleName: string;
  moduleWeight: number;
  featureName: string;
  featureWeight: number;
  featureStatus?: ContractFeatureStatus;
  featureDelivery?: ContractItemDeliveryStatus;
  /** Número da linha na folha Excel (para mensagens de erro). */
  sourceRow: number;
};
import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateIf, ValidateNested } from "class-validator";

/** Grupo de trabalho GLPI (ID na instância; nome opcional para exibição). */
export class ContractGlpiGroupLinkDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  glpiGroupId!: number;

  @IsOptional()
  @IsString()
  glpiGroupName?: string;
}

export class CreateContractModuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight!: number;
}

export class UpdateContractModuleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number;
}

export class CreateContractFeatureDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight!: number;

  @IsOptional()
  @IsEnum(ContractFeatureStatus)
  status?: ContractFeatureStatus;

  @IsOptional()
  @IsEnum(ContractItemDeliveryStatus)
  deliveryStatus?: ContractItemDeliveryStatus;
}

export class UpdateContractFeatureDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsEnum(ContractFeatureStatus)
  status?: ContractFeatureStatus;

  @IsOptional()
  @IsEnum(ContractItemDeliveryStatus)
  deliveryStatus?: ContractItemDeliveryStatus;
}

export class CreateContractServiceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  unit!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitValue!: number;
}

export class UpdateContractServiceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitValue?: number;
}

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

  @IsOptional()
  @IsString()
  managingUnit?: string;

  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @IsString()
  @IsNotEmpty()
  cnpj!: string;

  @IsEnum(ContractType)
  contractType!: ContractType;

  @IsOptional()
  @IsEnum(LawType)
  lawType?: LawType;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalValue?: number;

  @IsNumber()
  @Min(0)
  monthlyValue!: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  installationValue?: number | null;

  @IsOptional()
  @IsDateString()
  implementationPeriodStart?: string;

  @IsOptional()
  @IsDateString()
  implementationPeriodEnd?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @IsNumber()
  slaTarget?: number;

  @IsString()
  fiscalId!: string;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  /** Vínculos a grupos GLPI (substitui lista em criação). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractGlpiGroupLinkDto)
  glpiGroups?: ContractGlpiGroupLinkDto[];
}

export class UpdateContractDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  number?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  managingUnit?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  companyName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cnpj?: string;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @IsOptional()
  @IsEnum(LawType)
  lawType?: LawType;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyValue?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  installationValue?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsDateString()
  implementationPeriodStart?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsDateString()
  implementationPeriodEnd?: string | null;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @IsNumber()
  slaTarget?: number;

  @IsOptional()
  @IsString()
  fiscalId?: string;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  /**
   * Grupos GLPI associados ao contrato. Se enviado (incluindo `[]`), substitui todos os vínculos existentes.
   * Omitir o campo para não alterar os vínculos.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractGlpiGroupLinkDto)
  glpiGroups?: ContractGlpiGroupLinkDto[];
}

/** Corpo opcional ao salvar uma memória financeira do contrato (valores atuais antes de alterar). */
export class CreateContractFinancialSnapshotDto {
  @IsOptional()
  @IsString()
  note?: string;
}

/** Aditivo ou reajuste que altera valores e/ou fim de vigência do contrato (salvo e aplicado no banco de dados). */
export class CreateContractAmendmentDto {
  @IsOptional()
  @IsString()
  referenceCode?: string;

  @IsDateString()
  effectiveDate!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  newTotalValue!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  newMonthlyValue!: number;

  @IsDateString()
  newEndDate!: string;
}
