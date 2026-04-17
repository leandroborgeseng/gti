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
