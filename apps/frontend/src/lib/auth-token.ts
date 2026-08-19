import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";

export { GTI_TOKEN_COOKIE };

export function readBrowserAuthToken(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const prefix = `${GTI_TOKEN_COOKIE}=`;
  const part = document.cookie.split("; ").find((c) => c.startsWith(prefix));
  if (!part) {
    return null;
  }
  return decodeURIComponent(part.slice(prefix.length));
}

/** Grava o JWT no cookie acessível ao browser (mesmo padrão do seletor de contexto). */
export function setBrowserAuthToken(token: string, maxAgeSeconds = 60 * 60 * 24 * 7): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${GTI_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

export function clearBrowserAuthToken(): void {
  if (typeof document === "undefined") return;
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
