/** Constantes partilhadas cliente/servidor para backup do sistema (sem dependências Node). */

/** Versão do formato do pacote de backup. */
export const BACKUP_FORMAT_VERSION = 1;

/** Frase exigida no formulário de restauração. */
export const BACKUP_RESTORE_CONFIRM_PHRASE = "RESTAURAR";

/**
 * Variáveis relevantes para migração de servidor.
 * Só se regista se estão definidas — nunca os valores (segredos).
 */
export const BACKUP_ENV_CHECKLIST_KEYS = [
  "DATABASE_URL",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "GLPI_BASE_URL",
  "NEXT_PUBLIC_GLPI_BASE_URL",
  "GLPI_TOKEN_URL",
  "GLPI_DOC_URL",
  "GLPI_TICKETS_PATH",
  "GLPI_CLIENT_ID",
  "GLPI_CLIENT_SECRET",
  "GLPI_USERNAME",
  "GLPI_PASSWORD",
  "GLPI_OAUTH_SCOPE",
  "GLPI_USER_AGENT",
  "CRON_EXPRESSION",
  "GLPI_CRON_DISABLED",
  "HTTP_TIMEOUT_MS",
  "UPLOAD_ROOT",
  "UPLOAD_MAX_MB",
  "BACKUP_MAX_MB",
  "BACKUP_ENCRYPTION_KEY",
  "S3_BACKUP_ENABLED",
  "S3_BACKUP_BUCKET",
  "S3_BACKUP_REGION",
  "S3_BACKUP_ACCESS_KEY_ID",
  "S3_BACKUP_SECRET_ACCESS_KEY",
  "S3_BACKUP_ENDPOINT",
  "S3_BACKUP_PREFIX",
  "BOOTSTRAP_ADMIN_EMAIL",
  "BOOTSTRAP_ADMIN_PASSWORD",
  "NEXT_PUBLIC_BACKEND_URL",
  "BACKEND_API_BASE_URL",
  "PRISMA_NO_AUTO_WIPE_ON_LEGACY_DRIFT"
] as const;
