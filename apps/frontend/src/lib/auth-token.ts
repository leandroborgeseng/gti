import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";

export { GTI_TOKEN_COOKIE };

const SESSION_STORAGE_KEY = "gti_access_token";

export function readBrowserAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const fromSession = sessionStorage.getItem(SESSION_STORAGE_KEY)?.trim();
    if (fromSession) return fromSession;
  } catch {
    /* private mode / bloqueio de storage */
  }
  if (typeof document === "undefined") {
    return null;
  }
  const prefix = `${GTI_TOKEN_COOKIE}=`;
  const part = document.cookie.split("; ").find((c) => c.startsWith(prefix));
  if (!part) {
    return null;
  }
  try {
    return decodeURIComponent(part.slice(prefix.length));
  } catch {
    return part.slice(prefix.length);
  }
}

/** Grava o JWT em sessionStorage (confiável) e no cookie do browser. */
export function setBrowserAuthToken(token: string, maxAgeSeconds = 60 * 60 * 24 * 7): void {
  if (typeof window === "undefined") return;
  const clean = token.trim();
  if (!clean) return;
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, clean);
  } catch {
    /* ignore */
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${GTI_TOKEN_COOKIE}=${encodeURIComponent(clean)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

export function clearBrowserAuthToken(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  document.cookie = `${GTI_TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Cabeçalho `Authorization` para chamadas à API Nest (browser ou RSC). */
export async function authHeadersForApi(): Promise<Record<string, string>> {
  if (typeof window !== "undefined") {
    const t = readBrowserAuthToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
  const { cookies } = await import("next/headers");
  const t = cookies().get(GTI_TOKEN_COOKIE)?.value;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
