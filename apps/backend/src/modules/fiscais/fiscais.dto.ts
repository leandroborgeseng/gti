import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class CreateFiscalDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;
}
