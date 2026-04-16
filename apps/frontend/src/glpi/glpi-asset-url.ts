import { env } from "./config/env";

/** Garante que o URL aponta para o mesmo host que a API GLPI configurada. */
export function resolveGlpiAssetUrl(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  try {
    const apiBase = new URL(env.GLPI_BASE_URL);
    const glpiOrigin = `${apiBase.protocol}//${apiBase.host}`;
    const fromApiBase = new URL(input, env.GLPI_BASE_URL);
    const fromOrigin = new URL(input, `${glpiOrigin}/`);
    const candidate = fromApiBase.origin === apiBase.origin ? fromApiBase : fromOrigin;
    if (candidate.origin !== apiBase.origin) {
      return null;
    }
    return candidate.toString();
  } catch {
    return null;
  }
}
