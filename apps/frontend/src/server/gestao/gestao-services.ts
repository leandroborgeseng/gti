import { prisma } from "@/glpi/config/prisma";
import { ContractsService } from "@gestao/modules/contracts/contracts.service";
import { DashboardService } from "@gestao/modules/dashboard/dashboard.service";
import { ExportsService } from "@gestao/modules/exports/exports.service";
import { FiscaisService } from "@gestao/modules/fiscais/fiscais.service";
import { GlosasService } from "@gestao/modules/glosas/glosas.service";
import { GoalsService } from "@gestao/modules/goals/goals.service";
import { GovernanceTicketsService } from "@gestao/modules/governance-tickets/governance-tickets.service";
import { MeasurementsService } from "@gestao/modules/measurements/measurements.service";
import { MonthlyContractClosureReportService } from "@gestao/modules/reports/monthly-contract-closure.service";
import { OperationalEventsService } from "@gestao/modules/operational-events/operational-events.service";
import { ProjectsService } from "@gestao/modules/projects/projects.service";
import { SuppliersService } from "@gestao/modules/suppliers/suppliers.service";
import { UsersService } from "@gestao/modules/users/users.service";
import { StorageService } from "@gestao/storage/storage.service";
import type { PrismaService } from "@gestao/prisma/prisma.service";

const prismaSvc = prisma as unknown as PrismaService;

const storage = new StorageService();

export const gestaoContracts = new ContractsService(prismaSvc);
export const gestaoMeasurements = new MeasurementsService(prismaSvc, storage);
export const gestaoGlosas = new GlosasService(prismaSvc, storage);
export const gestaoDashboard = new DashboardService(prismaSvc);
export const gestaoGovernance = new GovernanceTicketsService(prismaSvc);
export const gestaoGoals = new GoalsService(prismaSvc);
export const gestaoSuppliers = new SuppliersService(prismaSvc);
export const gestaoFiscais = new FiscaisService(prismaSvc);
export const gestaoUsers = new UsersService(prismaSvc);
export const gestaoExports = new ExportsService(prismaSvc);
export const gestaoMonthlyClosureReport = new MonthlyContractClosureReportService(prismaSvc);
export const gestaoOperationalEvents = new OperationalEventsService(prismaSvc);
export const gestaoProjects = new ProjectsService(prismaSvc, storage);

let goalsBootstrapped = false;

export async function ensureGoalsBootstrapped(): Promise<void> {
  if (goalsBootstrapped) return;
  await gestaoGoals.onModuleInit();
  goalsBootstrapped = true;
}
