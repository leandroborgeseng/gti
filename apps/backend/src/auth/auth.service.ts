import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./login.dto";
import type { JwtPayload } from "./jwt.strategy";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async login(dto: LoginDto): Promise<{ access_token: string; expires_in: string; user: { email: string; role: string } }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("Credenciais inválidas");
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Credenciais inválidas");
    }
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const access_token = await this.jwt.signAsync(payload);
    return {
      access_token,
      expires_in: process.env.JWT_EXPIRES_IN ?? "7d",
      user: { email: user.email, role: user.role }
    };
  }
}
