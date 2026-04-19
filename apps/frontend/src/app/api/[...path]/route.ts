import { NextResponse } from "next/server";
import { normalizeBackendApiBaseUrl } from "@/lib/normalize-backend-api-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Base da API Nest (contratos, fiscais, medições, etc.) para o proxy servidor-a-servidor.
 * Preferir `BACKEND_API_BASE_URL` em Docker (URL interna). `NEXT_PUBLIC_BACKEND_URL` também serve aqui.
 * Se ambas faltarem, assume Nest em `127.0.0.1:4000` (desenvolvimento local típico).
 */
function backendApiBase(): string {
  const fromServer = process.env.BACKEND_API_BASE_URL?.trim();
  if (fromServer) return normalizeBackendApiBaseUrl(fromServer);
  const fromPublic = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (fromPublic) return normalizeBackendApiBaseUrl(fromPublic);
  return "http://127.0.0.1:4000/api";
}

function buildTargetUrl(pathSegments: string[], search: string): string {
  const base = backendApiBase();
  const suffix =
    pathSegments.length > 0 ? `/${pathSegments.map((p) => encodeURIComponent(p)).join("/")}` : "";
  return `${base}${suffix}${search}`;
}

const hopByHop = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade"
]);

async function proxy(req: Request, ctx: { params: { path: string[] } }): Promise<Response> {
  const pathSegments = ctx.params.path ?? [];
  const url = new URL(req.url);
  const target = buildTargetUrl(pathSegments, url.search);

  const headers = new Headers();
  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);

  const method = req.method.toUpperCase();
  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const buf = await req.arrayBuffer();
    body = buf.byteLength > 0 ? buf : undefined;
  }

  let res: Response;
  try {
    res = await fetch(target, { method, headers, body, cache: "no-store" });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const cause = err.cause != null ? (err.cause instanceof Error ? err.cause.message : String(err.cause)) : "";
    const msg = [err.message, cause].filter(Boolean).join(" — ");
    return NextResponse.json(
      {
        error: "API de gestão indisponível",
        message:
          "Não foi possível contactar o backend Nest. Em produção defina BACKEND_API_BASE_URL com o URL interno do Nest (evita o Next chamar o próprio domínio). Em local use Nest na porta 4000 ou NEXT_PUBLIC_BACKEND_URL.",
        detail: msg
      },
      { status: 502 }
    );
  }

  const out = new Headers();
  res.headers.forEach((value, key) => {
    if (hopByHop.has(key.toLowerCase())) return;
    out.set(key, value);
  });

  const buf = await res.arrayBuffer();
  return new NextResponse(buf, { status: res.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
