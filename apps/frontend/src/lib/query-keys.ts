/** Chaves estáveis para TanStack Query (gestão contratual). */
export const queryKeys = {
  authMe: ["gestao", "auth", "me"] as const,
  users: ["gestao", "users"] as const,
  suppliers: ["gestao", "suppliers"] as const,
  fiscais: ["gestao", "fiscais"] as const,
  contracts: ["gestao", "contracts"] as const,
  myPermissions: ["gestao", "permissions", "me"] as const,
  contractFormData: (id: string) => ["gestao", "contracts", "form-data", id] as const,
  contractSummary: (id: string) => ["gestao", "contracts", "summary", id] as const,
  contractStructure: (id: string) => ["gestao", "contracts", "structure", id] as const,
  contractAmendments: (id: string) => ["gestao", "contracts", "amendments", id] as const,
  contractSchedules: (id: string) => ["gestao", "contracts", "schedules", id] as const,
  contractOccurrences: (id: string) => ["gestao", "contracts", "occurrences", id] as const,
  contractControladoriaCases: (id: string) =>
    ["gestao", "contracts", "controladoria-cases", id] as const,
  contractValidationGroups: (id: string) => ["gestao", "contracts", "validation-groups", id] as const,
  /** Resumo dos contratos na tela Funcionalidades. */
  modulesDeliveryOverview: ["gestao", "modules-delivery-overview"] as const,
  contractModulesDelivery: (contractId: string) => ["gestao", "contract-modules-delivery", contractId] as const,
  moduleFeaturesDelivery: (contractId: string, moduleId: string) =>
    ["gestao", "module-features-delivery", contractId, moduleId] as const,
  modulesDeliverySearch: (key: string) => ["gestao", "modules-delivery-search", key] as const,
  contractModuleValidators: ["gestao", "contract-module-validators"] as const,
  userOptions: ["gestao", "user-options"] as const,
  /** Grupos GLPI distintos nos tickets em cache (catálogo para vínculo ao contrato). */
  glpiAssignedGroups: ["gestao", "glpi-assigned-groups"] as const,
  /** Chamados GLPI em cache vinculados aos grupos do contrato. */
  contractGlpiTickets: (contractId: string, filterKey: string) =>
    ["gestao", "contract-glpi-tickets", contractId, filterKey] as const,
  contractConsumptions: (contractId: string) => ["gestao", "contract-consumptions", contractId] as const,
  contractConsumptionMovements: (contractId: string, filterKey: string) =>
    ["gestao", "contract-consumption-movements", contractId, filterKey] as const,
  contractItemChangeLogs: (contractId: string, filterKey = "default") =>
    ["gestao", "contract-item-change-logs", contractId, filterKey] as const,
  contractFiles: (contractId: string, filterKey = "default") =>
    ["gestao", "contract-files", contractId, filterKey] as const,
  /** Catálogo de tipos padronizados e unidades de medida dos itens de precificação. */
  contractPricingCatalog: ["gestao", "contract-pricing-catalog"] as const,
  /** Conferência administrativa do backfill dos itens de precificação. */
  pricingMigrationReview: ["gestao", "admin", "pricing-migration-review"] as const,
  /** Conferência administrativa da migração de identificação dos contratos. */
  identificationMigrationReview: ["gestao", "admin", "identification-migration-review"] as const,
  measurements: ["gestao", "measurements"] as const,
  glosas: ["gestao", "glosas"] as const,
  goals: ["gestao", "goals"] as const,
  governanceTickets: ["gestao", "governance-tickets"] as const,
  projects: ["gestao", "projects"] as const,
  projectCollections: ["gestao", "project-collections"] as const,
  projectSupervisors: ["gestao", "project-supervisors"] as const,
  projectsDashboard: ["gestao", "projects", "dashboard"] as const,
  /** Prefixo para invalidar todas as queries da vista plana de tarefas. */
  projectsAllTasksRoot: ["gestao", "projects", "all-tasks"] as const,
  dashboardSummary: ["gestao", "dashboard-summary"] as const,
  dashboardAlerts: ["gestao", "dashboard-alerts"] as const,
  deadlines: (filterKey: string) => ["gestao", "deadlines", filterKey] as const,
  organizations: ["gestao", "admin", "organizations"] as const,
  accessProfiles: ["gestao", "admin", "access-profiles"] as const,
  rolePermissions: (role: string) => ["gestao", "admin", "role-permissions", role] as const,
  profilePermissions: (profileId: string) => ["gestao", "admin", "profile-permissions", profileId] as const,
  userPermissions: (userId: string, profileId?: string) =>
    ["gestao", "admin", "user-permissions", userId, profileId ?? "default"] as const,
  adminItemTypes: ["gestao", "admin", "item-types"] as const,
  contractTypeCatalog: ["gestao", "admin", "contract-types"] as const,
  hiringTypes: ["gestao", "admin", "hiring-types"] as const,
  /** Consulta central de auditoria e logs (admin). */
  auditLogs: (filterKey: string) => ["gestao", "admin", "audit-logs", filterKey] as const,
  auditEventConfig: ["gestao", "admin", "audit-event-config"] as const,
  auditRetention: ["gestao", "admin", "audit-retention"] as const,
  auditRetentionIndicators: ["gestao", "admin", "audit-retention-indicators"] as const,
  auditRetentionRuns: ["gestao", "admin", "audit-retention-runs"] as const,
  emailOutboundConfig: ["gestao", "admin", "email-outbound"] as const,
  emailOutboundLogs: ["gestao", "admin", "email-outbound-logs"] as const,
  /** Notificações de um contrato. */
  contractNotifications: (contractId: string) => ["gestao", "contract-notifications", contractId] as const,
  contractNotification: (id: string) => ["gestao", "contract-notification", id] as const,
  notificationTemplates: (includeInactive: boolean) =>
    ["gestao", "notification-templates", includeInactive] as const,
  notificationMailMerge: ["gestao", "notification-mail-merge"] as const,
  myContractNotifications: ["gestao", "my-contract-notifications"] as const,
  controladoriaCasesAdmin: ["gestao", "admin", "controladoria-cases"] as const,
  authRegisterOptions: ["auth", "register-options"] as const,
  fiscalUserOptions: ["gestao", "fiscais", "user-options"] as const,
  glpiSyncStatus: (scope: string) => ["glpi", "sync-status", scope] as const,
  auditLogDetail: (id: string, source: string) => ["gestao", "admin", "audit-log-detail", id, source] as const,
  permissionHistory: (mode: string, subjectId: string) =>
    ["gestao", "admin", "permission-history", mode, subjectId] as const,
  /** Prefixo para invalidar buscas de funcionalidades. */
  modulesDeliverySearchRoot: ["gestao", "modules-delivery-search"] as const,
  /** Prefixo para invalidar movimentos de consumo de um contrato. */
  contractConsumptionMovementsRoot: (contractId: string) =>
    ["gestao", "contract-consumption-movements", contractId] as const,
  /** Prefixo para invalidar todos os prazos. */
  deadlinesRoot: ["gestao", "deadlines"] as const,
  notificationTemplatesRoot: ["gestao", "notification-templates"] as const,
  auditLogsRoot: ["gestao", "admin", "audit-logs"] as const,
  permissionHistoryRoot: ["gestao", "admin", "permission-history"] as const,
  contractGlpiTicketsRoot: (contractId: string) => ["gestao", "contract-glpi-tickets", contractId] as const
} as const;
