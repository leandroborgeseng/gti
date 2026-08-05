/**
 * Catálogo padrão de eventos de auditoria (ticket 68).
 * Usado no seed da migração (espelhado em SQL) e em «Restaurar padrão».
 */

export type AuditDetailLevel = "ACTION_ONLY" | "ACTION_AND_VALUES";

export type AuditEventCatalogItem = {
  moduleKey: string;
  moduleLabel: string;
  screenKey: string;
  actionKey: string;
  label: string;
  enabled: boolean;
  detailLevel: AuditDetailLevel;
  mandatory: boolean;
  sortOrder: number;
};

function item(
  moduleKey: string,
  moduleLabel: string,
  screenKey: string,
  actionKey: string,
  label: string,
  opts: { mandatory?: boolean; enabled?: boolean; detailLevel?: AuditDetailLevel; sortOrder: number }
): AuditEventCatalogItem {
  return {
    moduleKey,
    moduleLabel,
    screenKey,
    actionKey,
    label,
    enabled: opts.enabled ?? true,
    detailLevel: opts.detailLevel ?? "ACTION_AND_VALUES",
    mandatory: opts.mandatory ?? false,
    sortOrder: opts.sortOrder
  };
}

/** Eventos padrão agrupados por módulo. */
export const DEFAULT_AUDIT_EVENT_CATALOG: AuditEventCatalogItem[] = [
  // Acesso / autenticação (obrigatórios)
  item("auth", "Acesso", "session", "LOGIN", "Login", { mandatory: true, sortOrder: 10 }),
  item("auth", "Acesso", "session", "LOGOUT", "Logout", { mandatory: true, sortOrder: 20 }),

  // Administração
  item("admin", "Administração", "users", "CREATE", "Criar usuário", { mandatory: true, sortOrder: 10 }),
  item("admin", "Administração", "users", "UPDATE", "Editar usuário", { sortOrder: 20 }),
  item("admin", "Administração", "users", "DELETE", "Excluir usuário", { sortOrder: 30 }),
  item("admin", "Administração", "users", "APPROVE", "Aprovar usuário", { sortOrder: 40 }),
  item("admin", "Administração", "permissions", "UPDATE", "Alterar permissões", {
    mandatory: true,
    sortOrder: 50
  }),
  item("admin", "Administração", "organizations", "CREATE", "Criar órgão", { sortOrder: 60 }),
  item("admin", "Administração", "organizations", "UPDATE", "Editar órgão", { sortOrder: 70 }),
  item("admin", "Administração", "audit_config", "UPDATE", "Alterar configuração de auditoria", {
    mandatory: true,
    sortOrder: 80
  }),
  item("admin", "Administração", "email_config", "UPDATE", "Alterar configuração de e-mail", { sortOrder: 90 }),
  item("admin", "Administração", "email_config", "TEST", "Testar envio de e-mail", { sortOrder: 100 }),

  // Contratos
  item("contracts", "Contratos", "contract", "CREATE", "Criar contrato", { sortOrder: 10 }),
  item("contracts", "Contratos", "contract", "UPDATE", "Editar contrato", { sortOrder: 20 }),
  item("contracts", "Contratos", "contract", "DELETE", "Excluir contrato", { sortOrder: 30 }),
  item("contracts", "Contratos", "contract", "APPROVE", "Aprovar contrato", { sortOrder: 40 }),
  item("contracts", "Contratos", "contract", "AMEND", "Registrar aditivo/reajuste", { sortOrder: 50 }),
  item("contracts", "Contratos", "structure", "CREATE", "Incluir item da estrutura", { sortOrder: 60 }),
  item("contracts", "Contratos", "structure", "UPDATE", "Editar item da estrutura", { sortOrder: 70 }),
  item("contracts", "Contratos", "structure", "DELETE", "Excluir item da estrutura", { sortOrder: 80 }),
  item("contracts", "Contratos", "pricing", "CREATE", "Incluir item contratual", { sortOrder: 90 }),
  item("contracts", "Contratos", "pricing", "UPDATE", "Editar item contratual", { sortOrder: 100 }),
  item("contracts", "Contratos", "pricing", "DELETE", "Excluir item contratual", { sortOrder: 110 }),
  item("contracts", "Contratos", "occurrence", "CREATE", "Criar ocorrência", { sortOrder: 120 }),
  item("contracts", "Contratos", "occurrence", "UPDATE", "Editar ocorrência", { sortOrder: 130 }),
  item("contracts", "Contratos", "occurrence", "DELETE", "Excluir ocorrência", { sortOrder: 140 }),
  item("contracts", "Contratos", "occurrence", "STATUS_CHANGE", "Alterar situação da ocorrência", { sortOrder: 150 }),
  item("contracts", "Contratos", "controladoria", "CREATE", "Encaminhar à Controladoria", { sortOrder: 160 }),
  item("contracts", "Contratos", "controladoria", "UPDATE", "Atualizar caso Controladoria", { sortOrder: 170 }),

  // Medições
  item("measurements", "Medições", "measurement", "CREATE", "Criar medição", { sortOrder: 10 }),
  item("measurements", "Medições", "measurement", "UPDATE", "Editar medição", { sortOrder: 20 }),
  item("measurements", "Medições", "measurement", "APPROVE", "Aprovar medição", { sortOrder: 30 }),
  item("measurements", "Medições", "measurement", "CALCULATE", "Calcular medição", { sortOrder: 40 }),
  item("measurements", "Medições", "measurement", "DELETE", "Excluir medição", { sortOrder: 50 }),

  // Glosas
  item("glosas", "Glosas", "glosa", "CREATE", "Criar glosa", { sortOrder: 10 }),
  item("glosas", "Glosas", "glosa", "UPDATE", "Editar glosa", { sortOrder: 20 }),
  item("glosas", "Glosas", "glosa", "DELETE", "Excluir glosa", { sortOrder: 30 }),

  // Metas
  item("goals", "Metas", "goal", "CREATE", "Criar meta", { sortOrder: 10 }),
  item("goals", "Metas", "goal", "UPDATE", "Editar meta", { sortOrder: 20 }),
  item("goals", "Metas", "goal", "DELETE", "Excluir meta", { sortOrder: 30 }),

  // Projetos
  item("projects", "Projetos", "project", "CREATE", "Criar projeto", { sortOrder: 10 }),
  item("projects", "Projetos", "project", "UPDATE", "Editar projeto", { sortOrder: 20 }),
  item("projects", "Projetos", "task", "CREATE", "Criar tarefa", { sortOrder: 30 }),
  item("projects", "Projetos", "task", "UPDATE", "Editar tarefa", { sortOrder: 40 }),
  item("projects", "Projetos", "task", "DELETE", "Excluir tarefa", { sortOrder: 50 }),

  // Fornecedores / fiscais
  item("suppliers", "Fornecedores", "supplier", "CREATE", "Criar fornecedor", { sortOrder: 10 }),
  item("suppliers", "Fornecedores", "supplier", "UPDATE", "Editar fornecedor", { sortOrder: 20 }),
  item("fiscais", "Fiscais", "fiscal", "CREATE", "Criar fiscal", { sortOrder: 10 }),
  item("fiscais", "Fiscais", "fiscal", "UPDATE", "Editar fiscal", { sortOrder: 20 }),

  // Governança
  item("governance", "Governança", "ticket", "CREATE", "Criar ticket de governança", { sortOrder: 10 }),
  item("governance", "Governança", "ticket", "UPDATE", "Editar ticket de governança", { sortOrder: 20 })
];

/** Mapeia entidade Prisma / auditLog.entity → chaves do catálogo (melhor esforço). */
export function resolveAuditCatalogKeys(
  entity: string,
  action: string
): { moduleKey: string; screenKey: string; actionKey: string } {
  const a = action.trim().toUpperCase();
  const e = entity.trim();

  const map: Record<string, { moduleKey: string; screenKey: string }> = {
    Contract: { moduleKey: "contracts", screenKey: "contract" },
    ContractAmendment: { moduleKey: "contracts", screenKey: "contract" },
    ContractAmendmentItem: { moduleKey: "contracts", screenKey: "contract" },
    ContractModule: { moduleKey: "contracts", screenKey: "structure" },
    ContractFeature: { moduleKey: "contracts", screenKey: "structure" },
    ContractService: { moduleKey: "contracts", screenKey: "structure" },
    ContractPricingItem: { moduleKey: "contracts", screenKey: "pricing" },
    ContractValidationGroup: { moduleKey: "contracts", screenKey: "structure" },
    ContractModuleFiscal: { moduleKey: "contracts", screenKey: "structure" },
    ContractFeatureResponsible: { moduleKey: "contracts", screenKey: "structure" },
    ContractSchedule: { moduleKey: "contracts", screenKey: "contract" },
    ContractOccurrence: { moduleKey: "contracts", screenKey: "occurrence" },
    ContractOccurrenceEvent: { moduleKey: "contracts", screenKey: "occurrence" },
    ContractControladoriaCase: { moduleKey: "contracts", screenKey: "controladoria" },
    Measurement: { moduleKey: "measurements", screenKey: "measurement" },
    MeasurementItem: { moduleKey: "measurements", screenKey: "measurement" },
    Glosa: { moduleKey: "glosas", screenKey: "glosa" },
    Goal: { moduleKey: "goals", screenKey: "goal" },
    GoalAction: { moduleKey: "goals", screenKey: "goal" },
    Project: { moduleKey: "projects", screenKey: "project" },
    ProjectTask: { moduleKey: "projects", screenKey: "task" },
    Supplier: { moduleKey: "suppliers", screenKey: "supplier" },
    Fiscal: { moduleKey: "fiscais", screenKey: "fiscal" },
    TicketGovernance: { moduleKey: "governance", screenKey: "ticket" },
    User: { moduleKey: "admin", screenKey: "users" },
    Organization: { moduleKey: "admin", screenKey: "organizations" },
    RolePermission: { moduleKey: "admin", screenKey: "permissions" },
    UserPermission: { moduleKey: "admin", screenKey: "permissions" },
    AccessProfile: { moduleKey: "admin", screenKey: "permissions" },
    AuditEventConfig: { moduleKey: "admin", screenKey: "audit_config" },
    EmailOutboundConfig: { moduleKey: "admin", screenKey: "email_config" }
  };

  const base = map[e] ?? { moduleKey: "other", screenKey: e.toLowerCase() };
  let actionKey = a;
  if (a === "AMEND_CANCEL") actionKey = "AMEND";
  if (a === "IDENTIFICATION_MIGRATION" || a === "IMPORT_STRUCTURE" || a === "BULK_VALIDATION_GROUP") {
    actionKey = "UPDATE";
  }
  if (a.startsWith("CREATE")) actionKey = a.includes("MANUAL") ? "UPDATE" : "CREATE";
  if (a === "AUTO_STATUS_UPDATE" || a === "MANUAL_PROGRESS") actionKey = "UPDATE";
  if (a === "FORWARD_CONTROLADORIA") actionKey = "CREATE";

  return { moduleKey: base.moduleKey, screenKey: base.screenKey, actionKey };
}
