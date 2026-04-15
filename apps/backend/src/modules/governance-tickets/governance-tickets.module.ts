import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { GovernanceTicketsController } from "./governance-tickets.controller";
import { GovernanceTicketsService } from "./governance-tickets.service";

@Module({
  controllers: [GovernanceTicketsController],
  providers: [GovernanceTicketsService, PrismaService],
  exports: [GovernanceTicketsService]
})
export class GovernanceTicketsModule {}
