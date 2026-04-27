/** Utilitários parcarregando dados da API Nest sem engolir erros (robustez / diagnóstico). */

export function formatLoadError(e: unknown): string {
  if (e instanceof Error && e.message.trim()) {
    return e.message.trim();
  }
  return "Erro desconhecido ao contactar o servidor.";
}

export type SafeLoadOk<T> = { data: T; error: null };
export type SafeLoadFail<T> = { data: T; error: string };
export type SafeLoadResult<T> = SafeLoadOk<T> | SafeLoadFail<T>;

/** Em falha devolve `fallback` e a mensagem de erro (para listagens). */
export async function safeLoad<T>(fn: () => Promise<T>, fallback: T): Promise<SafeLoadResult<T>> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (e) {
    return { data: fallback, error: formatLoadError(e) };
  }
}

export type SafeLoadNullableOk<T> = { data: T; error: null };
export type SafeLoadNullableFail = { data: null; error: string };
export type SafeLoadNullableResult<T> = SafeLoadNullableOk<T> | SafeLoadNullableFail;

/** Para detalhe: sem fallback; em falha `data` é null. */
export async function safeLoadNullable<T>(fn: () => Promise<T>): Promise<SafeLoadNullableResult<T>> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (e) {
    return { data: null, error: formatLoadError(e) };
  }
}

/** Junta mensagens únicas para um único alerta (várias fontes em paralelo). */
export function collectLoadErrors(messages: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of messages) {
    if (!m) continue;
    const t = m.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
