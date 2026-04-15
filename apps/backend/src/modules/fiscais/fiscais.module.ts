import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FiscaisController } from "./fiscais.controller";
import { FiscaisService } from "./fiscais.service";

@Module({
  controllers: [FiscaisController],
  providers: [FiscaisService, PrismaService],
  exports: [FiscaisService]
})
export class FiscaisModule {}
