import { UserApprovalStatus, UserRole } from "@prisma/client";
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

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

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: "Papel inválido" })
  role?: UserRole;
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
  @IsEnum(UserApprovalStatus, { message: "Status de aprovação inválido" })
  approvalStatus?: UserApprovalStatus;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: "A senha deve ter pelo menos 8 caracteres" })
  password?: string;
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
