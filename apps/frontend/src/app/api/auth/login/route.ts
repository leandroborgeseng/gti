import { NextResponse } from "next/server";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";

function nestApiBase(): string {
  return process.env.BACKEND_INTERNAL_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000/api";
}

export async function POST(req: Request): Promise<NextResponse> {
  const body = await req.json();
  const r = await fetch(`${nestApiBase()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const text = await r.text();
  if (!r.ok) {
    return new NextResponse(text || "Credenciais inválidas", { status: r.status });
  }
  let access_token: string;
  try {
    access_token = (JSON.parse(text) as { access_token: string }).access_token;
  } catch {
    return new NextResponse("Resposta inválida do servidor de autenticação", { status: 502 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GTI_TOKEN_COOKIE, access_token, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production"
  });
  return res;
}
