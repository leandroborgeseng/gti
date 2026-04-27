import dotenv from "dotenv";
import path from "node:path";
import { normalizeEnvValue } from "@/lib/normalize-env-value";
import { mergeExtraEnvFromFilesAndJson } from "@/glpi/config/merge-extra-env";

/** Carrega variáveis do monorepo e da pasta do Next (Railway / local). */
function loadEnvFiles(): void {
  const cwd = process.cwd();
  const roots = [
    path.resolve(cwd, "../../.env"),
    path.resolve(cwd, "../../.env.local"),
    path.resolve(cwd, ".env"),
    path.resolve(cwd, ".env.local")
  ];
  for (const p of roots) {
    dotenv.config({ path: p });
  }
}

loadEnvFiles();
/** Opcional: `config/glpi-env.local.json` (gitignored) ou variável `GTI_ENV_JSON` na Railway. */
mergeExtraEnvFromFilesAndJson();

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
  const value = normalizeEnvValue(process.env[name]);
  if (value) {
    return value;
  }
  if (allowBuildStubs) {
    return buildFallback;
  }
  throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
}

/**
 * Aceita `https://host/api.php`, `https://host/apirest.php` ou só `https://host` (assume API de alto nível).
 */
/** API v2 do GLPI usa prefixo `/v2` (ex.: `/v2/Assistance/Ticket`). */
function normalizeTicketsPath(raw: string | undefined, fallback: string): string {
  const v = normalizeEnvValue(raw) || fallback;
  if (v.startsWith("/Assistance/") && !v.startsWith("/v2/")) {
    return `/v2${v}`;
  }
  return v;
}

function normalizeGlpiApiBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "https://build.invalid/api.php";
  }
  if (/api\.php$/i.test(trimmed) || /apirest\.php$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/api.php`;
}

const rawGlpiBase = requireEnv("GLPI_BASE_URL", "https://build.invalid/api.php");

export const env = {
  GLPI_BASE_URL: normalizeGlpiApiBase(rawGlpiBase),
  GLPI_DOC_URL: requireEnv("GLPI_DOC_URL", "https://build.invalid/api.php/v2/doc.json"),
  GLPI_CLIENT_ID: requireEnv("GLPI_CLIENT_ID", "build"),
  GLPI_CLIENT_SECRET: requireEnv("GLPI_CLIENT_SECRET", "build"),
  GLPI_USERNAME: requireEnv("GLPI_USERNAME", "build"),
  GLPI_PASSWORD: requireEnv("GLPI_PASSWORD", "build"),
  GLPI_TICKETS_PATH: normalizeTicketsPath(process.env.GLPI_TICKETS_PATH, "/v2/Assistance/Ticket"),
  GLPI_OAUTH_SCOPE: normalizeEnvValue(process.env.GLPI_OAUTH_SCOPE) || "api",
  GLPI_USER_AGENT: normalizeEnvValue(process.env.GLPI_USER_AGENT) || "glpi-sync-mvp/1.0",
  /** Se definido, pedido OAuth2 de token usa este URL em vez de `{GLPI_BASE_URL}/token`. */
  GLPI_TOKEN_URL: normalizeEnvValue(process.env.GLPI_TOKEN_URL) || "",
  PORT: Number(process.env.PORT || 3000),
  CRON_EXPRESSION: process.env.CRON_EXPRESSION || "*/5 * * * *",
  /**
   * Com escopo «todos os tickets», o cron principal só persiste **abertos**; este agenda a passagem só de
   * **fechados** (estatística). Expressão node-cron (UTC do servidor). `none` = desativar.
   */
  GLPI_CRON_CLOSED_EXPRESSION: (() => {
    const raw = normalizeEnvValue(process.env.GLPI_CRON_CLOSED_EXPRESSION);
    if (raw && raw.toLowerCase() === "none") {
      return "";
    }
    return raw || "30 4 * * *";
  })(),
  HTTP_TIMEOUT_MS: Number(process.env.HTTP_TIMEOUT_MS || 20000),
  /** Quantidade de tickets por requisição ao GLPI (50–500). Padrão mais alto: menos voltas ao servidor. */
  GLPI_TICKETS_PAGE_SIZE: clampInt(process.env.GLPI_TICKETS_PAGE_SIZE, 50, 500, 300),
  /** Quantas páginas são pedidas em paralelo (prefetch). 1 = sequencial; mais agentes = mais carga no GLPI. */
  GLPI_TICKETS_FETCH_CONCURRENCY: clampInt(process.env.GLPI_TICKETS_FETCH_CONCURRENCY, 1, 16, 8),
  /** Quantos tickets da mesma página persistem em paralelo no PostgreSQL (upsert + atributos). */
  GLPI_SYNC_PERSIST_CONCURRENCY: clampInt(process.env.GLPI_SYNC_PERSIST_CONCURRENCY, 1, 32, 12),
  /** Limite de páginas GLPI por execução (evita laço infinito se o total remoto for desconhecido). */
  GLPI_SYNC_MAX_PAGES: clampInt(process.env.GLPI_SYNC_MAX_PAGES, 50, 50_000, 5000),
  /**
   * A cada quantos tickets carregados emitir um log agregado de tempos (GLPI vs preparação vs banco de dados).
   * 0 = desativar apenas o agregado; o log **por página** mantém-se sempre.
   */
  GLPI_SYNC_METRICS_LOG_EVERY: clampInt(process.env.GLPI_SYNC_METRICS_LOG_EVERY, 0, 50_000, 500)
};
