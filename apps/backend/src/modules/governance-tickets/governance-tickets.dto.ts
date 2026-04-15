import { GovernancePriority, GovernanceType, TicketWatcherRole } from "@prisma/client";
import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateTicketGovernanceDto {
  @IsString()
  @IsNotEmpty()
  ticketId!: string;

  @IsString()
  @IsNotEmpty()
  contractId!: string;

  @IsDateString()
  openedAt!: string;
}

export class AcknowledgeTicketDto {
  @IsDateString()
  acknowledgedAt!: string;
}

export class ClassifyTicketDto {
  @IsEnum(GovernancePriority)
  priority!: GovernancePriority;

  @IsEnum(GovernanceType)
  type!: GovernanceType;
}

export class SetResolvedDto {
  @IsDateString()
  resolvedAt!: string;
}

export class ExtendDeadlineDto {
  @IsDateString()
  newDeadline!: string;

  @IsString()
  @IsNotEmpty()
  justification!: string;

  @IsString()
  @IsNotEmpty()
  createdBy!: string;
}

export class SendToControladoriaDto {
  @IsString()
  @IsNotEmpty()
  seiProcessNumber!: string;

  @IsOptional()
  @IsString()
  controladoriaUserId?: string;
}

export class AddWatcherDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsEnum(TicketWatcherRole)
  role!: TicketWatcherRole;
}

export class NotifyManagerDto {
  @IsBoolean()
  managerNotified!: boolean;

  @IsString()
  @IsNotEmpty()
  description!: string;
}
