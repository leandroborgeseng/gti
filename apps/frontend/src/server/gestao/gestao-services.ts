import { prisma } from "@/glpi/config/prisma";
import { OrganizationsService } from "@gestao/modules/organizations/organizations.service";
import { PermissionsService } from "@gestao/modules/permissions/permissions.service";
import { ContractTypeCatalogService } from "@gestao/modules/contract-type-catalog/contract-type-catalog.service";
import { HiringTypesService } from "@gestao/modules/hiring-types/hiring-types.service";
import { ContractsService } from "@gestao/modules/contracts/contracts.service";
import { ContractConsumptionService } from "@gestao/modules/contracts/contract-consumption.service";
import { DashboardService } from "@gestao/modules/dashboard/dashboard.service";
import { ExportsService } from "@gestao/modules/exports/exports.service";
import { FiscaisService } from "@gestao/modules/fiscais/fiscais.service";
import { GlosasService } from "@gestao/modules/glosas/glosas.service";
import { GoalsService } from "@gestao/modules/goals/goals.service";
import { GovernanceTicketsService } from "@gestao/modules/governance-tickets/governance-tickets.service";
import { MeasurementsService } from "@gestao/modules/measurements/measurements.service";
import { MonthlyContractClosureReportService } from "@gestao/modules/reports/monthly-contract-closure.service";
import { PricingItemsFinancialReportService } from "@gestao/modules/reports/pricing-items-financial-report.service";
import { OperationalEventsService } from "@gestao/modules/operational-events/operational-events.service";
import { ProjectsService } from "@gestao/modules/projects/projects.service";
import { SuppliersService } from "@gestao/modules/suppliers/suppliers.service";
import { UsersService } from "@gestao/modules/users/users.service";
import { UserAccessService } from "@gestao/modules/users/user-access.service";
import { UserAssignmentsService } from "@gestao/modules/users/user-assignments.service";
import { AuditLogsService } from "@gestao/modules/audit-logs/audit-logs.service";
import { DeadlinesService } from "@gestao/modules/deadlines/deadlines.service";
import { NotificationTemplatesService } from "@gestao/modules/notification-templates/notification-templates.service";
import { ContractNotificationsService } from "@gestao/modules/contract-notifications/contract-notifications.service";
import { StorageService } from "@gestao/storage/storage.service";
import type { PrismaService } from "@gestao/prisma/prisma.service";

const prismaSvc = prisma as unknown as PrismaService;

const storage = new StorageService();

export const gestaoContracts = new ContractsService(prismaSvc, storage);
export const gestaoConsumption = new ContractConsumptionService(prismaSvc);
export const gestaoMeasurements = new MeasurementsService(prismaSvc, storage);
export const gestaoGlosas = new GlosasService(prismaSvc, storage);
export const gestaoDashboard = new DashboardService(prismaSvc);
export const gestaoGovernance = new GovernanceTicketsService(prismaSvc);
export const gestaoGoals = new GoalsService(prismaSvc);
export const gestaoSuppliers = new SuppliersService(prismaSvc);
export const gestaoFiscais = new FiscaisService(prismaSvc);
export const gestaoUsers = new UsersService(prismaSvc);
export const gestaoUserAccess = new UserAccessService(prismaSvc);
export const gestaoUserAssignments = new UserAssignmentsService(prismaSvc);
export const gestaoAuditLogs = new AuditLogsService(prismaSvc);
export const gestaoDeadlines = new DeadlinesService(prismaSvc);
export const gestaoNotificationTemplates = new NotificationTemplatesService(prismaSvc);
export const gestaoContractNotifications = new ContractNotificationsService(prismaSvc);
export const gestaoExports = new ExportsService(prismaSvc);
export const gestaoMonthlyClosureReport = new MonthlyContractClosureReportService(prismaSvc);
export const gestaoPricingItemsFinancialReport = new PricingItemsFinancialReportService(prismaSvc);
export const gestaoOperationalEvents = new OperationalEventsService(prismaSvc);
export const gestaoProjects = new ProjectsService(prismaSvc, storage);
export const gestaoOrganizations = new OrganizationsService(prismaSvc);
export const gestaoPermissions = new PermissionsService(prismaSvc);
export const gestaoContractTypeCatalog = new ContractTypeCatalogService(prismaSvc);
export const gestaoHiringTypes = new HiringTypesService(prismaSvc);

let goalsBootstrapped = false;

export async function ensureGoalsBootstrapped(): Promise<void> {
  if (goalsBootstrapped) return;
  await gestaoGoals.onModuleInit();
  goalsBootstrapped = true;
}
