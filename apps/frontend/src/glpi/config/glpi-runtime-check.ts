import { looksLikeRailwayTemplateLiteral, normalizeEnvValue } from "@/lib/normalize-env-value";
import { mergeExtraEnvFromFilesAndJson } from "@/glpi/config/merge-extra-env";

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

export type GlpiReadiness =
  | { ok: true }
  | { ok: false; missing: string[]; unexpandedReferences?: string[] };

export function glpiEnvironmentReadiness(): GlpiReadiness {
  mergeExtraEnvFromFilesAndJson();
  const missing: string[] = [];
  const unexpandedReferences: string[] = [];
  for (const k of GLPI_REQUIRED) {
    const raw = process.env[k];
    if (looksLikeRailwayTemplateLiteral(raw)) {
      missing.push(k);
      unexpandedReferences.push(k);
      continue;
    }
    if (!normalizeEnvValue(raw)) {
      missing.push(k);
    }
  }
  if (missing.length > 0) {
    return { ok: false, missing, unexpandedReferences: unexpandedReferences.length ? unexpandedReferences : undefined };
  }
  return { ok: true };
}

/** Diagnóstico sem valores (só se existe valor normalizado). */
export function glpiEnvPresenceSummary(): Record<string, { set: boolean; templateLiteral: boolean }> {
  mergeExtraEnvFromFilesAndJson();
  const out: Record<string, { set: boolean; templateLiteral: boolean }> = {};
  for (const k of GLPI_REQUIRED) {
    const raw = process.env[k];
    const templateLiteral = looksLikeRailwayTemplateLiteral(raw);
    const normalized = normalizeEnvValue(raw);
    out[k] = {
      set: Boolean(normalized) && !templateLiteral,
      templateLiteral
    };
  }
  return out;
}

/**
 * Indica se a chave existe em `process.env` e o comprimento do valor bruto (sem revelar conteúdo).
 * Ajuda a distinguir «Railway não injetou» (chave ausente) de «valor vazio».
 */
export function glpiEnvKeyDiagnostics(): Record<string, { chaveExiste: boolean; comprimentoValor: number }> {
  mergeExtraEnvFromFilesAndJson();
  const out: Record<string, { chaveExiste: boolean; comprimentoValor: number }> = {};
  for (const k of GLPI_REQUIRED) {
    const raw = process.env[k];
    out[k] = {
      chaveExiste: Object.prototype.hasOwnProperty.call(process.env, k),
      comprimentoValor: typeof raw === "string" ? raw.length : 0
    };
  }
  return out;
}
