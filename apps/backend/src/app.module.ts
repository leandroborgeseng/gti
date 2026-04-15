import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";
import { ContractsModule } from "./modules/contracts/contracts.module";
import { MeasurementsModule } from "./modules/measurements/measurements.module";
import { GlosasModule } from "./modules/glosas/glosas.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { GovernanceTicketsModule } from "./modules/governance-tickets/governance-tickets.module";
import { GoalsModule } from "./modules/goals/goals.module";

@Module({
  imports: [ContractsModule, MeasurementsModule, GlosasModule, DashboardModule, GovernanceTicketsModule, GoalsModule],
  providers: [PrismaService]
})
export class AppModule {}
