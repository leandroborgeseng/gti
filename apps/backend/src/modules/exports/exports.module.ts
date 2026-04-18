import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";

@Module({
  controllers: [ExportsController],
  providers: [ExportsService, PrismaService]
})
export class ExportsModule {}
