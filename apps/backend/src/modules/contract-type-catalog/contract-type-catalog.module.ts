import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ContractTypeCatalogController } from "./contract-type-catalog.controller";
import { ContractTypeCatalogService } from "./contract-type-catalog.service";

@Module({
  controllers: [ContractTypeCatalogController],
  providers: [ContractTypeCatalogService, PrismaService],
  exports: [ContractTypeCatalogService]
})
export class ContractTypeCatalogModule {}
