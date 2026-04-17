import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./login.dto";
import { Public } from "./public.decorator";
import type { JwtPayload } from "./jwt.strategy";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto): Promise<unknown> {
    return this.auth.login(dto);
  }

  @Get("me")
  me(@Req() req: Request): unknown {
    const u = req.user as JwtPayload;
    return { id: u.sub, email: u.email, role: u.role };
  }
}
