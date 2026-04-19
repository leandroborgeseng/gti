/**
 * Remove barra final e corrige typo comum `https://https://...`, que faz o
 * cliente HTTP tratar "https" como hostname (`getaddrinfo ENOTFOUND https`).
 */
export function normalizeBackendApiBaseUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, "");
  u = u.replace(/^https:\/\/https:\/\//i, "https://");
  u = u.replace(/^http:\/\/https:\/\//i, "https://");
  return u;
}
