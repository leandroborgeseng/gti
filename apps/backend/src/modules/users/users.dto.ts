import { UserApprovalStatus, UserRole } from "@prisma/client";
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class CreateUserDto {
  @IsEmail({}, { message: "E-mail inválido" })
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: "A senha deve ter pelo menos 8 caracteres" })
  password!: string;

  @IsOptional()
  @IsEnum(UserRole, { message: "Papel inválido" })
  role?: UserRole;
}

export class UpdateUserDto {
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
