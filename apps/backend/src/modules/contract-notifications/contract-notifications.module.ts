import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ContractNotificationsController } from "./contract-notifications.controller";
import { ContractNotificationsService } from "./contract-notifications.service";

@Module({
  controllers: [ContractNotificationsController],
  providers: [ContractNotificationsService, PrismaService],
  exports: [ContractNotificationsService]
})
export class ContractNotificationsModule {}
