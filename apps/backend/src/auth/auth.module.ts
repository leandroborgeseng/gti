import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaService } from "../prisma/prisma.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? "desenvolvimento-apenas-altere-em-producao",
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? "7d" }
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PrismaService],
  exports: [AuthService]
})
export class AuthModule {}
