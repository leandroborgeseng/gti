import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";

function nestApiBase(): string {
  return process.env.BACKEND_INTERNAL_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000/api";
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const token = cookies().get(GTI_TOKEN_COOKIE)?.value;
  if (!token) {
    return new NextResponse("Não autenticado", { status: 401 });
  }
  const id = params.id;
  const r = await fetch(`${nestApiBase()}/attachments/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!r.ok) {
    const t = await r.text();
    return new NextResponse(t || "Erro ao obter anexo", { status: r.status });
  }
  const buf = await r.arrayBuffer();
  const ct = r.headers.get("content-type") ?? "application/octet-stream";
  const cd = r.headers.get("content-disposition");
  const res = new NextResponse(buf, { status: 200 });
  res.headers.set("content-type", ct);
  if (cd) {
    res.headers.set("content-disposition", cd);
  }
  return res;
}
