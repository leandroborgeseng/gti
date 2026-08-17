import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { ContractConsumptionService } from "./contract-consumption.service";

@Module({
  controllers: [ContractsController],
  providers: [ContractsService, ContractConsumptionService, PrismaService],
  exports: [ContractsService, ContractConsumptionService]
})
export class ContractsModule {}
