/** Chaves estáveis para TanStack Query (gestão contratual). */
export const queryKeys = {
  users: ["gestao", "users"] as const,
  suppliers: ["gestao", "suppliers"] as const,
  fiscais: ["gestao", "fiscais"] as const,
  contracts: ["gestao", "contracts"] as const,
  measurements: ["gestao", "measurements"] as const,
  glosas: ["gestao", "glosas"] as const,
  goals: ["gestao", "goals"] as const,
  governanceTickets: ["gestao", "governance-tickets"] as const,
  projects: ["gestao", "projects"] as const,
  projectsDashboard: ["gestao", "projects", "dashboard"] as const,
  dashboardSummary: ["gestao", "dashboard-summary"] as const,
  dashboardAlerts: ["gestao", "dashboard-alerts"] as const
} as const;
