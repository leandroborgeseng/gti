import {
  ContractAmendmentItemAction,
  ContractAmendmentType,
  ContractControladoriaCaseStatus,
  ContractFeatureStatus,
  ContractItemDeliveryStatus,
  ContractItemCriticality,
  ContractOccurrenceOrigin,
  ContractOccurrenceSeverity,
  ContractOccurrenceStatus,
  ContractOccurrenceType,
  ContractPricingBillingKind,
  ContractPricingItemStatus,
  ContractPricingPeriodicity,
  ContractScheduleMilestoneStatus,
  ContractScheduleOrigin,
  ContractScheduleStatus,
  ContractScheduleType,
  ContractStatus,
  ContractType,
  LawType
} from "@prisma/client";

/** Linha validada para importação em massa de módulos/funcionalidades (planilha). */
export type ContractStructureImportRow = {
  moduleName: string;
  moduleWeight?: number;
  moduleCriticality?: ContractItemCriticality;
  featureCode?: string | null;
  featureName: string;
  featureWeight?: number;
  featureCriticality?: ContractItemCriticality;
  featureStatus?: ContractFeatureStatus;
  featureDelivery?: ContractItemDeliveryStatus;
  /** Nome do grupo de validação no contrato (opcional; resolvido no import). */
  validationGroupName?: string | null;
  /** Número da linha na folha Excel (para mensagens de erro). */
  sourceRow: number;
};
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested
} from "class-validator";

/** Item de precificação dinâmica do contrato. */
export class PricingItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence?: number;

  @IsString()
  @IsNotEmpty()
  typeId!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsNotEmpty()
  unitId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitValue!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalValue?: number;

  @IsOptional()
  @IsBoolean()
  totalManual?: boolean;

  @IsOptional()
  @IsString()
  totalJustification?: string | null;

  @IsEnum(ContractPricingBillingKind)
  billingKind!: ContractPricingBillingKind;

  @IsOptional()
  @IsEnum(ContractPricingPeriodicity)
  periodicity?: ContractPricingPeriodicity | null;

  @IsOptional()
  @IsDateString()
  periodStart?: string | null;

  @IsOptional()
  @IsDateString()
  periodEnd?: string | null;

  @IsOptional()
  @IsEnum(ContractPricingItemStatus)
  status?: ContractPricingItemStatus;

  @IsOptional()
  @IsBoolean()
  includeInGlosaBase?: boolean;

  @IsOptional()
  @IsBoolean()
  consumptionEnabled?: boolean;

  @IsOptional()
  @IsString()
  consumptionUnitId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  consumptionAvailableQuantity?: number | null;

  @IsOptional()
  @IsString()
  consumptionFinancialRule?: string | null;

  @IsOptional()
  @IsString()
  consumptionAvailability?: string | null;

  @IsOptional()
  @IsBoolean()
  consumptionAccumulates?: boolean;

  @IsOptional()
  @IsBoolean()
  consumptionRequiresValidation?: boolean;
}

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
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsEnum(ContractItemCriticality)
  criticality?: ContractItemCriticality;

  /** Legado: um único fiscal. Preferir `fiscalUserIds`. */
  @IsOptional()
  @IsString()
  validatorId?: string;

  /** Fiscais responsáveis do módulo (substitui/coexiste com `validatorId`). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fiscalUserIds?: string[];

  @IsOptional()
  @IsString()
  glosaPricingItemId?: string | null;
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

  @IsOptional()
  @IsEnum(ContractItemCriticality)
  criticality?: ContractItemCriticality;

  /** Legado: um único fiscal. Preferir `fiscalUserIds`. */
  @IsOptional()
  @IsString()
  validatorId?: string | null;

  /** Fiscais responsáveis do módulo. Array vazio remove todos. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fiscalUserIds?: string[];

  @IsOptional()
  @IsString()
  glosaPricingItemId?: string | null;
}

export class CreateContractFeatureDto {
  @IsOptional()
  @IsString()
  itemCode?: string;

  @IsOptional()
  @IsEnum(ContractItemCriticality)
  criticality?: ContractItemCriticality;

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

  /** Grupo de validação (obrigatório em novos itens). */
  @IsString()
  @IsNotEmpty()
  validationGroupId!: string;

  /** Responsáveis específicos do item. Complementam os membros do grupo de validação. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibleUserIds?: string[];
}

export class UpdateContractFeatureDto {
  @IsOptional()
  @IsString()
  itemCode?: string;

  @IsOptional()
  @IsEnum(ContractItemCriticality)
  criticality?: ContractItemCriticality;

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

  /**
   * Data efetiva da entrega / entrega parcial (AAAA-MM-DD).
   * Obrigatória ao mudar para ENTREGUE ou PARCIALMENTE ENTREGUE.
   */
  @IsOptional()
  @IsString()
  deliveryEffectiveDate?: string | null;

  /**
   * Percentual acumulado (5–95, passo 5) quando parcialmente entregue.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(95)
  partialDeliveryPercent?: number | null;

  /** Observação opcional do evento de entrega. */
  @IsOptional()
  @IsString()
  deliveryNote?: string | null;

  /** Grupo de validação do item. Null remove o vínculo (legado). */
  @IsOptional()
  @IsString()
  validationGroupId?: string | null;

  /** Responsáveis específicos do item. Complementam os membros do grupo. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibleUserIds?: string[];

  /** Origem da alteração para auditoria (ex.: tela simplificada de funcionalidades). */
  @IsOptional()
  @IsString()
  changeSource?: string;
}

export class CreateContractValidationGroupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberUserIds?: string[];
}

export class UpdateContractValidationGroupDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberUserIds?: string[];
}

/** Alteração em massa do grupo de validação de várias funcionalidades. */
export class BulkUpdateFeatureValidationGroupDto {
  @IsArray()
  @IsString({ each: true })
  featureIds!: string[];

  @IsOptional()
  @IsString()
  validationGroupId?: string | null;
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
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  number?: string;

  @IsOptional()
  @IsString()
  formalNumber?: string;

  @IsOptional()
  @IsString()
  administrativeProcess?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  contractTypeCatalogId?: string;

  @IsOptional()
  @IsString()
  hiringTypeId?: string;

  @IsOptional()
  @IsString()
  hiringProcedureNumber?: string;

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

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

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

  @IsOptional()
  @IsBoolean()
  globalValueManual?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  globalValueCurrent?: number;

  @IsOptional()
  @IsString()
  globalValueJustification?: string;

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

  /** Itens de precificação dinâmica (substitui valores fixos quando informado). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingItemDto)
  pricingItems?: PricingItemDto[];
}

export class CreateContractItemTypeAdminDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ContractPricingBillingKind)
  billingKind?: ContractPricingBillingKind;

  @IsOptional()
  @IsString()
  suggestedUnitId?: string | null;

  @IsOptional()
  @IsBoolean()
  participatesInGlosa?: boolean;

  @IsOptional()
  @IsBoolean()
  useInMeasurements?: boolean;

  @IsOptional()
  @IsBoolean()
  useInBalanceControl?: boolean;

  @IsOptional()
  @IsBoolean()
  useInConsumption?: boolean;

  @IsOptional()
  @IsBoolean()
  useInFinancialPlanning?: boolean;

  @IsOptional()
  @IsBoolean()
  infoOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateContractItemTypeAdminDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  label?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(ContractPricingBillingKind)
  billingKind?: ContractPricingBillingKind | null;

  @IsOptional()
  @IsString()
  suggestedUnitId?: string | null;

  @IsOptional()
  @IsBoolean()
  participatesInGlosa?: boolean;

  @IsOptional()
  @IsBoolean()
  useInMeasurements?: boolean;

  @IsOptional()
  @IsBoolean()
  useInBalanceControl?: boolean;

  @IsOptional()
  @IsBoolean()
  useInConsumption?: boolean;

  @IsOptional()
  @IsBoolean()
  useInFinancialPlanning?: boolean;

  @IsOptional()
  @IsBoolean()
  infoOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateContractDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  number?: string;

  @IsOptional()
  @IsString()
  formalNumber?: string | null;

  @IsOptional()
  @IsString()
  administrativeProcess?: string | null;

  @IsOptional()
  @IsString()
  organizationId?: string | null;

  @IsOptional()
  @IsString()
  contractTypeCatalogId?: string | null;

  @IsOptional()
  @IsString()
  hiringTypeId?: string | null;

  @IsOptional()
  @IsString()
  hiringProcedureNumber?: string | null;

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
  @IsBoolean()
  globalValueManual?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  globalValueCurrent?: number;

  @IsOptional()
  @IsString()
  globalValueJustification?: string | null;

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

  /** Substitui integralmente os itens de precificação quando informado. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingItemDto)
  pricingItems?: PricingItemDto[];
}

/** Confirmação obrigatória para exclusão definitiva/soft-delete de contrato. */
export class DeleteContractDto {
  /** Deve ser a palavra EXCLUIR ou o número do contrato. */
  @IsString()
  @IsNotEmpty()
  confirmation!: string;

  @IsString()
  @IsNotEmpty()
  justification!: string;
}

/** Justificativa obrigatória para emitir um novo código interno sem reutilizar o sequencial anterior. */
export class RegenerateInternalCodeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  justification!: string;
}

/** Valores «depois» de um item afetado pelo aditivo (CREATE/UPDATE). */
export class ContractAmendmentItemAfterDto {
  @IsOptional()
  @IsString()
  typeId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  unitId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalValue?: number;

  @IsOptional()
  @IsBoolean()
  totalManual?: boolean;

  @IsOptional()
  @IsString()
  totalJustification?: string | null;

  @IsOptional()
  @IsEnum(ContractPricingBillingKind)
  billingKind?: ContractPricingBillingKind;

  @IsOptional()
  @IsEnum(ContractPricingPeriodicity)
  periodicity?: ContractPricingPeriodicity | null;

  @IsOptional()
  @IsDateString()
  periodStart?: string | null;

  @IsOptional()
  @IsDateString()
  periodEnd?: string | null;

  @IsOptional()
  @IsBoolean()
  includeInGlosaBase?: boolean;
}

/** Item afetado pelo aditivo. */
export class ContractAmendmentItemDto {
  @IsEnum(ContractAmendmentItemAction)
  action!: ContractAmendmentItemAction;

  /** Obrigatório em UPDATE/SUPPRESS. */
  @IsOptional()
  @IsString()
  pricingItemId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  adjustmentPercent?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContractAmendmentItemAfterDto)
  after?: ContractAmendmentItemAfterDto;
}

/** Aditivo/reajuste por itens (e opcionalmente vigência/valores legados). */
export class CreateContractAmendmentDto {
  @IsEnum(ContractAmendmentType)
  type!: ContractAmendmentType;

  @IsOptional()
  @IsString()
  referenceCode?: string;

  @IsOptional()
  @IsDateString()
  formalizationDate?: string;

  /** Início dos efeitos (preferencial). */
  @IsOptional()
  @IsDateString()
  effectsStartDate?: string;

  /** Alias legado de effectsStartDate. */
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsDateString()
  newEndDate?: string;

  /** Legado / prorrogação sem alteração de itens. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  newTotalValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  newMonthlyValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  adjustmentPercent?: number;

  @IsOptional()
  @IsString()
  indexReference?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractAmendmentItemDto)
  items?: ContractAmendmentItemDto[];
}

export class CancelContractAmendmentDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  justification!: string;
}

/** Etapa/marco de cronograma do contrato. */
export class ContractScheduleMilestoneDto {
  @IsOptional()
  @IsString()
  id?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence!: number;

  @IsString()
  @IsNotEmpty()
  activity!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  pricingItemId?: string | null;

  @IsOptional()
  @IsString()
  featureId?: string | null;

  @IsOptional()
  @IsDateString()
  plannedStartDate?: string | null;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string | null;

  @IsOptional()
  @IsDateString()
  actualStartDate?: string | null;

  @IsOptional()
  @IsDateString()
  actualEndDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  percentComplete?: number | null;

  @IsOptional()
  @IsEnum(ContractScheduleMilestoneStatus)
  status?: ContractScheduleMilestoneStatus;

  @IsOptional()
  @IsString()
  dependencies?: string | null;

  @IsOptional()
  @IsString()
  observations?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibleUserIds?: string[];
}

export class CreateContractScheduleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(ContractScheduleType)
  type!: ContractScheduleType;

  @IsOptional()
  @IsString()
  purpose?: string | null;

  @IsOptional()
  @IsEnum(ContractScheduleOrigin)
  origin?: ContractScheduleOrigin;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsDateString()
  plannedStartDate?: string | null;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibleUserIds?: string[];

  @IsOptional()
  @IsString()
  companyResponsibles?: string | null;

  @IsOptional()
  @IsEnum(ContractScheduleStatus)
  status?: ContractScheduleStatus;

  @IsOptional()
  @IsBoolean()
  impactaFinanceiro?: boolean;

  @IsOptional()
  @IsString()
  pricingItemId?: string | null;

  @IsOptional()
  @IsString()
  observations?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractScheduleMilestoneDto)
  milestones?: ContractScheduleMilestoneDto[];
}

export class UpdateContractScheduleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(ContractScheduleType)
  type?: ContractScheduleType;

  @IsOptional()
  @IsString()
  purpose?: string | null;

  @IsOptional()
  @IsEnum(ContractScheduleOrigin)
  origin?: ContractScheduleOrigin;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsDateString()
  plannedStartDate?: string | null;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibleUserIds?: string[];

  @IsOptional()
  @IsString()
  companyResponsibles?: string | null;

  @IsOptional()
  @IsEnum(ContractScheduleStatus)
  status?: ContractScheduleStatus;

  @IsOptional()
  @IsBoolean()
  impactaFinanceiro?: boolean;

  @IsOptional()
  @IsString()
  pricingItemId?: string | null;

  @IsOptional()
  @IsString()
  observations?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractScheduleMilestoneDto)
  milestones?: ContractScheduleMilestoneDto[];
}

export class CreateContractOccurrenceDto {
  @IsEnum(ContractOccurrenceType)
  type!: ContractOccurrenceType;

  @IsEnum(ContractOccurrenceOrigin)
  origin!: ContractOccurrenceOrigin;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsDateString()
  detectionDate!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedPricingItemIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedFeatureIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedMeasurementIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedGlosaIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedScheduleIds?: string[];

  @IsOptional()
  @IsEnum(ContractOccurrenceSeverity)
  severity?: ContractOccurrenceSeverity;

  @IsOptional()
  @IsString()
  internalResponsibleUserId?: string | null;

  @IsOptional()
  @IsDateString()
  regularizationDeadline?: string | null;

  @IsOptional()
  @IsEnum(ContractOccurrenceStatus)
  status?: ContractOccurrenceStatus;

  @IsOptional()
  @IsString()
  conclusion?: string | null;

  @IsOptional()
  @IsString()
  evidenceNotes?: string | null;
}

export class UpdateContractOccurrenceDto {
  @IsOptional()
  @IsEnum(ContractOccurrenceType)
  type?: ContractOccurrenceType;

  @IsOptional()
  @IsEnum(ContractOccurrenceOrigin)
  origin?: ContractOccurrenceOrigin;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsDateString()
  detectionDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedPricingItemIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedFeatureIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedMeasurementIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedGlosaIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedScheduleIds?: string[];

  @IsOptional()
  @IsEnum(ContractOccurrenceSeverity)
  severity?: ContractOccurrenceSeverity;

  @IsOptional()
  @IsString()
  internalResponsibleUserId?: string | null;

  @IsOptional()
  @IsDateString()
  regularizationDeadline?: string | null;

  @IsOptional()
  @IsString()
  conclusion?: string | null;

  @IsOptional()
  @IsString()
  evidenceNotes?: string | null;
}

export class ChangeContractOccurrenceStatusDto {
  @IsEnum(ContractOccurrenceStatus)
  status!: ContractOccurrenceStatus;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  justification!: string;
}

export class ForwardOccurrenceToControladoriaDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  justification!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  summary!: string;

  @IsOptional()
  @IsString()
  suggestedActions?: string | null;
}

export class UpdateContractControladoriaCaseDto {
  @IsOptional()
  @IsEnum(ContractControladoriaCaseStatus)
  status?: ContractControladoriaCaseStatus;

  @IsOptional()
  @IsString()
  processNumber?: string | null;

  @IsOptional()
  @IsString()
  originSystem?: string | null;

  @IsOptional()
  @IsString()
  processLink?: string | null;

  @IsOptional()
  @IsDateString()
  openedAt?: string | null;

  @IsOptional()
  @IsString()
  subject?: string | null;

  @IsOptional()
  @IsString()
  unit?: string | null;

  @IsOptional()
  @IsString()
  responsiblesText?: string | null;

  @IsOptional()
  @IsString()
  phase?: string | null;

  @IsOptional()
  @IsString()
  deadlinesText?: string | null;

  @IsOptional()
  @IsString()
  decisionsText?: string | null;

  @IsOptional()
  @IsString()
  penaltiesText?: string | null;

  @IsOptional()
  @IsString()
  resultText?: string | null;

  @IsOptional()
  @IsString()
  seiNumber?: string | null;

  @IsOptional()
  @IsString()
  seiLink?: string | null;
}

