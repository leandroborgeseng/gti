import dotenv from "dotenv";

dotenv.config();

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export const env = {
  GLPI_BASE_URL: getEnv("GLPI_BASE_URL"),
  GLPI_DOC_URL: getEnv("GLPI_DOC_URL"),
  GLPI_CLIENT_ID: getEnv("GLPI_CLIENT_ID"),
  GLPI_CLIENT_SECRET: getEnv("GLPI_CLIENT_SECRET"),
  GLPI_USERNAME: getEnv("GLPI_USERNAME"),
  GLPI_PASSWORD: getEnv("GLPI_PASSWORD"),
  GLPI_TICKETS_PATH: process.env.GLPI_TICKETS_PATH || "/v2/Assistance/Ticket",
  GLPI_OAUTH_SCOPE: process.env.GLPI_OAUTH_SCOPE || "api",
  GLPI_USER_AGENT: process.env.GLPI_USER_AGENT || "glpi-sync-mvp/1.0",
  PORT: Number(process.env.PORT || 3000),
  CRON_EXPRESSION: process.env.CRON_EXPRESSION || "*/5 * * * *",
  HTTP_TIMEOUT_MS: Number(process.env.HTTP_TIMEOUT_MS || 20000),
  /** Quantidade de tickets por requisição ao GLPI (50–500). */
  GLPI_TICKETS_PAGE_SIZE: clampInt(process.env.GLPI_TICKETS_PAGE_SIZE, 50, 500, 250),
  /** Quantas páginas de tickets são pedidas em paralelo (antecipação). 1 = sequencial. */
  GLPI_TICKETS_FETCH_CONCURRENCY: clampInt(process.env.GLPI_TICKETS_FETCH_CONCURRENCY, 1, 12, 4)
};
