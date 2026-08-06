import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min
} from "class-validator";
import { NotificationPurpose, NotificationSeverity, NotificationType } from "@prisma/client";

export class CreateNotificationTemplateDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  documentTitle!: string;

  @IsString()
  @IsNotEmpty()
  emailSubject!: string;

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
  @IsInt()
  @Min(0)
  @Max(365)
  defaultResponseDays?: number;

  @IsOptional()
  @IsBoolean()
  requiresAck?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresResponse?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresSchedule?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresActionPlan?: boolean;

  @IsOptional()
  @IsString()
  reviewFlow?: string;

  @IsString()
  @IsNotEmpty()
  bodyHtml!: string;

  @IsOptional()
  @IsString()
  headerHtml?: string;

  @IsOptional()
  @IsString()
  footerHtml?: string;
}

export class UpdateNotificationTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  documentTitle?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  emailSubject?: string;

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
  @IsInt()
  @Min(0)
  @Max(365)
  defaultResponseDays?: number;

  @IsOptional()
  @IsBoolean()
  requiresAck?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresResponse?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresSchedule?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresActionPlan?: boolean;

  @IsOptional()
  @IsString()
  reviewFlow?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  headerHtml?: string | null;

  @IsOptional()
  @IsString()
  footerHtml?: string | null;
}
