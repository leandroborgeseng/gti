/** Chaves estáveis para TanStack Query (gestão contratual). */
export const queryKeys = {
  users: ["gestao", "users"] as const,
  suppliers: ["gestao", "suppliers"] as const,
  fiscais: ["gestao", "fiscais"] as const,
  contracts: ["gestao", "contracts"] as const,
  /** Visão geral de módulos e estado de entrega dos itens (`GET /contracts/overview/modules-delivery`). */
  modulesDeliveryOverview: ["gestao", "modules-delivery-overview"] as const,
  /** Grupos GLPI distintos nos tickets em cache (catálogo para vínculo ao contrato). */
  glpiAssignedGroups: ["gestao", "glpi-assigned-groups"] as const,
  measurements: ["gestao", "measurements"] as const,
  glosas: ["gestao", "glosas"] as const,
  goals: ["gestao", "goals"] as const,
  governanceTickets: ["gestao", "governance-tickets"] as const,
  projects: ["gestao", "projects"] as const,
  projectsDashboard: ["gestao", "projects", "dashboard"] as const,
  /** Prefixo para invalidar todas as queries da vista plana de tarefas. */
  projectsAllTasksRoot: ["gestao", "projects", "all-tasks"] as const,
  dashboardSummary: ["gestao", "dashboard-summary"] as const,
  dashboardAlerts: ["gestao", "dashboard-alerts"] as const
} as const;
