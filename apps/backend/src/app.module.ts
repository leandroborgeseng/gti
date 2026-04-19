import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RequestActorInterceptor } from "./auth/request-actor.interceptor";
import { RolesGuard } from "./auth/roles.guard";
import { PrismaService } from "./prisma/prisma.service";
import { StorageModule } from "./storage/storage.module";
import { ContractsModule } from "./modules/contracts/contracts.module";
import { MeasurementsModule } from "./modules/measurements/measurements.module";
import { GlosasModule } from "./modules/glosas/glosas.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { GovernanceTicketsModule } from "./modules/governance-tickets/governance-tickets.module";
import { GoalsModule } from "./modules/goals/goals.module";
import { SuppliersModule } from "./modules/suppliers/suppliers.module";
import { FiscaisModule } from "./modules/fiscais/fiscais.module";
import { AttachmentsModule } from "./modules/attachments/attachments.module";
import { UsersModule } from "./modules/users/users.module";
import { ExportsModule } from "./modules/exports/exports.module";
import { ProjectsModule } from "./modules/projects/projects.module";

@Module({
  imports: [
    AuthModule,
    StorageModule,
    UsersModule,
    ExportsModule,
    ProjectsModule,
    ContractsModule,
    MeasurementsModule,
    GlosasModule,
    DashboardModule,
    GovernanceTicketsModule,
    GoalsModule,
    SuppliersModule,
    FiscaisModule,
    AttachmentsModule
  ],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestActorInterceptor }
  ]
})
export class AppModule {}
