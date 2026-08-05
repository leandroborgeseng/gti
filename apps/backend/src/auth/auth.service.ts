import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./login.dto";
import type { JwtPayload } from "./jwt.strategy";
import { buildActiveContext, loadUserAccessContext } from "../common/access-context";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async login(dto: LoginDto): Promise<{
    access_token: string;
    expires_in: string;
    user: { email: string; role: string; mustChangePassword: boolean };
  }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("Credenciais inválidas");
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Credenciais inválidas");
    }
    if (user.approvalStatus === "PENDING") {
      throw new UnauthorizedException("Seu cadastro ainda está aguardando aprovação.");
    }
    if (user.approvalStatus === "REJECTED") {
      throw new UnauthorizedException("Seu cadastro não foi aprovado. Entre em contato com a administração.");
    }

    let role = user.role;
    try {
      const access = await loadUserAccessContext(this.prisma, user.id);
      if (access) {
        const ctx = buildActiveContext(access);
        role = ctx.role;
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            lastActiveProfileId: ctx.profileId,
            lastActiveOrganizationId: ctx.organizationId,
            ...(ctx.systemKey === "ADMIN" || ctx.systemKey === "EDITOR" || ctx.systemKey === "VIEWER"
              ? { role: ctx.systemKey }
              : {})
          }
        });
      }
    } catch {
      /* mantém role legado */
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role,
      mustChangePassword: user.mustChangePassword
    };
    const access_token = await this.jwt.signAsync(payload);
    return {
      access_token,
      expires_in: process.env.JWT_EXPIRES_IN ?? "7d",
      user: { email: user.email, role, mustChangePassword: user.mustChangePassword }
    };
  }

  async issueTokenForUser(user: {
    id: string;
    email: string;
    role: string;
    mustChangePassword: boolean;
  }): Promise<{ access_token: string; expires_in: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword
    };
    const access_token = await this.jwt.signAsync(payload);
    return { access_token, expires_in: process.env.JWT_EXPIRES_IN ?? "7d" };
  }
}
