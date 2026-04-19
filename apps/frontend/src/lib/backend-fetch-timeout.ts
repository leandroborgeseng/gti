const DEFAULT_MS = 25_000;
const MAX_MS = 120_000;

/**
 * Limite de tempo para `fetch` ao Nest (RSC e proxy). Sem isto, um alvo
 * inacessível pode deixar o pedido pendurado sem 502/504 visível no browser.
 */
export function getBackendFetchTimeoutMs(): number {
  const raw = process.env.BACKEND_FETCH_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MS;
  return Math.min(Math.floor(n), MAX_MS);
}

/** Combina timeout com um `AbortSignal` opcional vindo do `RequestInit`. */
export function backendFetchAbortSignal(existing?: AbortSignal | null): AbortSignal {
  const ms = getBackendFetchTimeoutMs();
  const deadline = AbortSignal.timeout(ms);
  if (!existing) return deadline;
  return AbortSignal.any([deadline, existing]);
}
