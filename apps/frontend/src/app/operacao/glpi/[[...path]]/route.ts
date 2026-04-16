import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function glpiOrigin(): string {
  const raw = (process.env.GLPI_SYNC_ORIGIN || "").trim().replace(/\/+$/, "");
  if (!raw) {
    throw new Error("GLPI_SYNC_ORIGIN não configurado no frontend");
  }
  return raw;
}

function upstreamUrl(segments: string[] | undefined, search: string): URL {
  const base = glpiOrigin();
  const tail = !segments?.length ? "/dashboard" : `/${segments.join("/")}`;
  const u = new URL(tail, base.endsWith("/") ? base : `${base}/`);
  if (search) {
    u.search = search.startsWith("?") ? search.slice(1) : search;
  }
  return u;
}

async function proxy(req: NextRequest, segments: string[] | undefined): Promise<NextResponse> {
  const u = upstreamUrl(segments, req.nextUrl.search);
  const headers = new Headers();
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);
  const lang = req.headers.get("accept-language");
  if (lang) headers.set("accept-language", lang);
  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
    redirect: "manual"
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }
  const upstream = await fetch(u.toString(), init);
  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      out.set(key, value);
    }
  });
  const buf = await upstream.arrayBuffer();
  return new NextResponse(buf, { status: upstream.status, headers: out });
}

type RouteCtx = { params: { path?: string[] } };

async function handle(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  try {
    return await proxy(req, ctx.params.path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no proxy GLPI";
    return new NextResponse(msg, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
