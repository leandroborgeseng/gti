import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import {
  ContractNotificationStatus,
  NotificationManifestationAnalysis,
  NotificationPurpose,
  NotificationSeverity,
  NotificationType
} from "@prisma/client";

export class CreateFromTemplateDto {
  @IsUUID()
  contractId!: string;

  @IsUUID()
  templateId!: string;

  @IsOptional()
  @IsString()
  subject?: string;
}

export class UpdateNotificationDraftDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  subject?: string;

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  headerHtml?: string | null;

  @IsOptional()
  @IsString()
  footerHtml?: string | null;

  @IsOptional()
  @IsEnum(NotificationPurpose)
  purpose?: NotificationPurpose;

  @IsOptional()
  @IsEnum(NotificationType)
  notificationType?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationSeverity)
  severity?: NotificationSeverity;

  @IsOptional()
  @IsBoolean()
  requiresAck?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresResponse?: boolean;

  @IsOptional()
  @IsDateString()
  ackDeadline?: string | null;

  @IsOptional()
  @IsDateString()
  responseDeadline?: string | null;

  @IsOptional()
  @IsString()
  effectsStartRule?: string | null;

  @IsOptional()
  related?: Record<string, unknown> | null;

  @IsOptional()
  formalizationRefs?: Record<string, unknown> | null;
}

export class TransitionNotificationDto {
  @IsEnum(ContractNotificationStatus)
  toStatus!: ContractNotificationStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CancelOrRectifyDto {
  @IsString()
  @MinLength(5, { message: "Informe uma justificativa com ao menos 5 caracteres." })
  reason!: string;
}

export class SignerInputDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class SetSignersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignerInputDto)
  signers!: SignerInputDto[];
}

export class SignNotificationDto {
  @IsString()
  @MinLength(1, { message: "Informe a senha." })
  password!: string;
}

export class SendNotificationDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraEmails?: string[];
}

export class ConfirmSendDto {
  @IsArray()
  @IsString({ each: true })
  recipients!: string[];

  @IsOptional()
  @IsString()
  emailStatus?: "SENT" | "FAILED";

  @IsOptional()
  @IsString()
  errorSummary?: string;
}

export class SaveResponseDto {
  @IsString()
  bodyText!: string;

  @IsOptional()
  itemStatuses?: Record<string, unknown> | null;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

export class AnalyzeResponseDto {
  @IsEnum(NotificationManifestationAnalysis)
  analysisStatus!: NotificationManifestationAnalysis;

  @IsString()
  @MinLength(3)
  analysisNote!: string;
}
