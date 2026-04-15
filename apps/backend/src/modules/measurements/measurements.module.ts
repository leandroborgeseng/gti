import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { MeasurementsController } from "./measurements.controller";
import { MeasurementsService } from "./measurements.service";

@Module({
  controllers: [MeasurementsController],
  providers: [MeasurementsService, PrismaService],
  exports: [MeasurementsService]
})
export class MeasurementsModule {}
