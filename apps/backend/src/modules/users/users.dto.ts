import { ExternalUserFunction, UserApprovalStatus, UserKind, UserRole } from "@prisma/client";
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf
} from "class-validator";

export class CreateUserDto {
  @IsEmail({}, { message: "E-mail inválido" })
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: "A senha deve ter pelo menos 8 caracteres" })
  password!: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  cpf?: string;

  /** Legado: órgão único. Preferir organizationIds. */
  @IsOptional()
  @IsString()
  organizationId?: string;

  /** Legado: papel único. Preferir profileIds. */
  @IsOptional()
  @IsEnum(UserRole, { message: "Papel inválido" })
  role?: UserRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  profileIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  organizationIds?: string[];

  @IsOptional()
  @IsBoolean()
  allOrganizations?: boolean;

  @IsOptional()
  @IsString()
  defaultProfileId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  defaultOrganizationId?: string | null;

  @IsOptional()
  @IsEnum(UserKind, { message: "Tipo de usuário inválido" })
  userKind?: UserKind;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsEnum(ExternalUserFunction, { message: "Função externa inválida" })
  externalFunction?: ExternalUserFunction;

  /** Contratos autorizados (somente EXTERNAL; devem pertencer ao mesmo fornecedor). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  authorizedContractIds?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  cpf?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  organizationId?: string | null;

  @IsOptional()
  @IsEnum(UserRole, { message: "Papel inválido" })
  role?: UserRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  profileIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  organizationIds?: string[];

  @IsOptional()
  @IsBoolean()
  allOrganizations?: boolean;

  @IsOptional()
  @IsString()
  defaultProfileId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  defaultOrganizationId?: string | null;

  @IsOptional()
  @IsEnum(UserApprovalStatus, { message: "Status de aprovação inválido" })
  approvalStatus?: UserApprovalStatus;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  approvalRejectionReason?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: "A senha deve ter pelo menos 8 caracteres" })
  password?: string;

  @IsOptional()
  @IsEnum(UserKind, { message: "Tipo de usuário inválido" })
  userKind?: UserKind;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  supplierId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(ExternalUserFunction, { message: "Função externa inválida" })
  externalFunction?: ExternalUserFunction | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  authorizedContractIds?: string[];
}

export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  firstName?: string | null;

  @IsOptional()
  @IsString()
  lastName?: string | null;

  @IsOptional()
  @IsString()
  profileColor?: string | null;

  @IsOptional()
  @IsString()
  jobTitle?: string | null;

  @IsOptional()
  @IsString()
  department?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;
}
