import fs from "node:fs";
import path from "node:path";
import { normalizeEnvValue } from "@/lib/normalize-env-value";

/**
 * Injeta chaves em `process.env` a partir de um objeto (ficheiro local ou `GTI_ENV_JSON`).
 * Só preenche chaves que ainda estão vazias — não sobrescreve variáveis já definidas pela Railway ou `.env`.
 */
function mergeRecordIntoEnv(record: Record<string, unknown>): void {
  for (const [key, val] of Object.entries(record)) {
    const k = key.trim();
    if (!k) continue;
    if (normalizeEnvValue(process.env[k])) {
      continue;
    }
    if (val === null || val === undefined) {
      continue;
    }
    const str = String(val).trim();
    if (!str) {
      continue;
    }
    process.env[k] = str;
  }
}

/** Caminho relativo ao cwd do Next (`apps/frontend` em dev e na imagem Docker). */
function localJsonPath(): string {
  return path.join(process.cwd(), "config", "glpi-env.local.json");
}

export function mergeExtraEnvFromFilesAndJson(): void {
  const filePath = localJsonPath();
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      mergeRecordIntoEnv(JSON.parse(raw) as Record<string, unknown>);
    } catch (e) {
      console.warn("[GTI] Não foi possível ler config/glpi-env.local.json:", e instanceof Error ? e.message : e);
    }
  }

  const inline = process.env.GTI_ENV_JSON?.trim();
  if (!inline) {
    return;
  }
  try {
    mergeRecordIntoEnv(JSON.parse(inline) as Record<string, unknown>);
  } catch (e) {
    console.warn("[GTI] GTI_ENV_JSON não é JSON válido:", e instanceof Error ? e.message : e);
  }
}
