import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { DeadlinesController } from "./deadlines.controller";
import { DeadlinesService } from "./deadlines.service";

@Module({
  controllers: [DeadlinesController],
  providers: [DeadlinesService, PrismaService],
  exports: [DeadlinesService]
})
export class DeadlinesModule {}
