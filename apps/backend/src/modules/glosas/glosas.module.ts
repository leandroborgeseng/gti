import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { GlosasController } from "./glosas.controller";
import { GlosasService } from "./glosas.service";

@Module({
  controllers: [GlosasController],
  providers: [GlosasService, PrismaService]
})
export class GlosasModule {}
