import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "E-mail inválido" })
  email!: string;

  @IsString()
  @MinLength(1, { message: "Palavra-passe obrigatória" })
  password!: string;
}
