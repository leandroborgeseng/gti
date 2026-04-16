import dotenv from "dotenv";
import path from "node:path";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

/** Durante `next build` não exigimos credenciais GLPI (ver `GLPI_SKIP_BOOTSTRAP` no `package.json`). */
const allowBuildStubs = process.env.GLPI_SKIP_BOOTSTRAP === "1";

function requireEnv(name: string, buildFallback: string): string {
  const value = process.env[name]?.trim();
  if (value) {
    return value;
  }
  if (allowBuildStubs) {
    return buildFallback;
  }
  throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
}

export const env = {
  GLPI_BASE_URL: requireEnv("GLPI_BASE_URL", "https://build.invalid/api.php"),
  GLPI_DOC_URL: requireEnv("GLPI_DOC_URL", "https://build.invalid/api.php/v2/doc.json"),
  GLPI_CLIENT_ID: requireEnv("GLPI_CLIENT_ID", "build"),
  GLPI_CLIENT_SECRET: requireEnv("GLPI_CLIENT_SECRET", "build"),
  GLPI_USERNAME: requireEnv("GLPI_USERNAME", "build"),
  GLPI_PASSWORD: requireEnv("GLPI_PASSWORD", "build"),
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
