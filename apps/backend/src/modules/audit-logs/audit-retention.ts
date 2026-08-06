/**
 * Categorias de retenção de auditoria (ticket 69).
 * O descarte nunca é seletivo por conteúdo — apenas por categoria + idade.
 */

export type AuditRetentionCategoryKey =
  | "AUTH"
  | "SECURITY"
  | "PERMISSIONS"
  | "CONTRACTS"
  | "MEASUREMENTS"
  | "GLOSAS"
  | "ADMIN"
  | "OTHER";

export type DefaultRetentionPolicy = {
  categoryKey: AuditRetentionCategoryKey;
  label: string;
  retentionDays: number;
  minRetentionDays: number;
  active: boolean;
  sortOrder: number;
};

/** Políticas padrão (active=false — descarte desligado). */
export const DEFAULT_AUDIT_RETENTION_POLICIES: DefaultRetentionPolicy[] = [
  {
    categoryKey: "AUTH",
    label: "Autenticação (login/logout)",
    retentionDays: 2555,
    minRetentionDays: 1825,
    active: false,
    sortOrder: 10
  },
  {
    categoryKey: "SECURITY",
    label: "Segurança",
    retentionDays: 2555,
    minRetentionDays: 1825,
    active: false,
    sortOrder: 20
  },
  {
    categoryKey: "PERMISSIONS",
    label: "Permissões",
    retentionDays: 2555,
    minRetentionDays: 1825,
    active: false,
    sortOrder: 30
  },
  {
    categoryKey: "CONTRACTS",
    label: "Contratos",
    retentionDays: 1825,
    minRetentionDays: 365,
    active: false,
    sortOrder: 40
  },
  {
    categoryKey: "MEASUREMENTS",
    label: "Medições",
    retentionDays: 1825,
    minRetentionDays: 365,
    active: false,
    sortOrder: 50
  },
  {
    categoryKey: "GLOSAS",
    label: "Glosas",
    retentionDays: 1825,
    minRetentionDays: 365,
    active: false,
    sortOrder: 60
  },
  {
    categoryKey: "ADMIN",
    label: "Administração",
    retentionDays: 1095,
    minRetentionDays: 365,
    active: false,
    sortOrder: 70
  },
  {
    categoryKey: "OTHER",
    label: "Outros",
    retentionDays: 730,
    minRetentionDays: 90,
    active: false,
    sortOrder: 80
  }
];

/**
 * Entidades preservadas mesmo que a categoria CONTRACTS esteja ativa
 * (notificações, ocorrências e dossiês de Controladoria).
 */
export const PRESERVED_AUDIT_ENTITIES = new Set([
  "ContractNotification",
  "ContractOccurrence",
  "ContractOccurrenceEvent",
  "ContractControladoriaCase",
  "ContractNotificationEvent",
  "ContractNotificationSigner",
  "ContractNotificationResponse"
]);

export function resolveAuditRetentionCategory(entity: string): AuditRetentionCategoryKey {
  const e = (entity ?? "").trim();
  if (!e) return "OTHER";
  if (e === "Auth" || e === "UserAccessEvent" || e === "PasswordResetToken") return "AUTH";
  if (
    e === "UserPermission" ||
    e === "AccessProfile" ||
    e === "UserAccessProfile" ||
    e === "RolePermission" ||
    e.startsWith("Permission")
  ) {
    return "PERMISSIONS";
  }
  if (e === "User" || e === "UserOrganization" || e === "Fiscal") return "SECURITY";
  if (e.startsWith("Glosa")) return "GLOSAS";
  if (e.startsWith("Measurement")) return "MEASUREMENTS";
  if (
    e.startsWith("Contract") ||
    e === "TicketGovernance" ||
    e === "Deadline" ||
    e === "Supplier"
  ) {
    return "CONTRACTS";
  }
  if (
    e === "EmailOutboundConfig" ||
    e === "AuditEventConfig" ||
    e === "AuditRetentionPolicy" ||
    e === "AuditRetentionRun" ||
    e === "Organization" ||
    e === "S3BackupConfig" ||
    e === "ContractTypeCatalog" ||
    e === "HiringType" ||
    e === "ContractItemType" ||
    e === "NotificationTemplate"
  ) {
    return "ADMIN";
  }
  return "OTHER";
}

/** Eventos de acesso (UserAccessEvent) entram na categoria AUTH. */
export function accessEventsRetentionCategory(): AuditRetentionCategoryKey {
  return "AUTH";
}
