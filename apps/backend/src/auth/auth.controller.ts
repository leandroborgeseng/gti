import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { resolveAuthMeForUser, switchUserAccessContext } from "../common/access-context";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import { LoginDto } from "./login.dto";
import { Public } from "./public.decorator";
import type { JwtPayload } from "./jwt.strategy";

class SwitchContextDto {
  profileId!: string;
  organizationId?: string | null;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService
  ) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto): Promise<unknown> {
    return this.auth.login(dto);
  }

  @Get("me")
  async me(@Req() req: Request): Promise<unknown> {
    const u = req.user as JwtPayload;
    return resolveAuthMeForUser(this.prisma, u.sub);
  }

  @Post("context")
  async switchContext(@Req() req: Request, @Body() body: SwitchContextDto): Promise<unknown> {
    const u = req.user as JwtPayload;
    const me = await switchUserAccessContext(this.prisma, u.sub, {
      profileId: body.profileId,
      organizationId: body.organizationId
    });
    const token = await this.auth.issueTokenForUser({
      id: me.id,
      email: me.email,
      role: me.activeContext.systemKey ?? me.role,
      mustChangePassword: me.mustChangePassword
    });
    return { ...me, access_token: token.access_token, expires_in: token.expires_in };
  }
}
