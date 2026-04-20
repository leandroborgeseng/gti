import type { NextRequest } from "next/server";

function hostLooksBroken(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "0.0.0.0" || h === "::" || h === "";
}

function hostnameFromForwardedHost(fwd: string): string | null {
  try {
    return new URL(`http://${fwd}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Origem pública (`https://domínio`) para cabeçalhos `Location:` por detrás de reverse proxy (Railway, etc.).
 * Evita `https://0.0.0.0:PORT` quando `HOSTNAME=0.0.0.0` ou o bind afeta `req.nextUrl`.
 */
export function publicSiteOriginFromRequest(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const fwdHost = fwd ? hostnameFromForwardedHost(fwd) : null;
  if (fwd && fwdHost && !hostLooksBroken(fwdHost)) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${fwd}`;
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (site) return site;

  const u = req.nextUrl;
  if (hostLooksBroken(u.hostname)) {
    const port = u.port || process.env.PORT || "3000";
    return `http://127.0.0.1:${port}`;
  }
  return u.origin;
}

/** URL absoluta para redirect (pathname começa por `/`). */
export function publicAbsoluteUrl(req: NextRequest, pathname: string): URL {
  const origin = publicSiteOriginFromRequest(req).replace(/\/+$/, "");
  return new URL(pathname, `${origin}/`);
}
