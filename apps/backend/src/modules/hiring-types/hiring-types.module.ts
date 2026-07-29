import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { HiringTypesController } from "./hiring-types.controller";
import { HiringTypesService } from "./hiring-types.service";

@Module({
  controllers: [HiringTypesController],
  providers: [HiringTypesService, PrismaService],
  exports: [HiringTypesService]
})
export class HiringTypesModule {}
