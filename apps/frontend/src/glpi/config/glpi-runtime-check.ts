/**
 * Verifica variáveis necessárias para o GLPI **sem** importar `./env` (que lança se faltar algo).
 * Usado no `instrumentation` e na rota `/api/glpi/status`.
 */
const GLPI_REQUIRED = [
  "DATABASE_URL",
  "GLPI_BASE_URL",
  "GLPI_DOC_URL",
  "GLPI_CLIENT_ID",
  "GLPI_CLIENT_SECRET",
  "GLPI_USERNAME",
  "GLPI_PASSWORD"
] as const;

export type GlpiReadiness = { ok: true } | { ok: false; missing: string[] };

export function glpiEnvironmentReadiness(): GlpiReadiness {
  const missing = GLPI_REQUIRED.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true };
}
