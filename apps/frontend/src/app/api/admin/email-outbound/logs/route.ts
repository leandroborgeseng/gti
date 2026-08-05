import { NextResponse } from "next/server";
import { listEmailSendLogs } from "@/server/admin/email-outbound";
import { jsonAdminError, requireAdmin } from "@/server/admin/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_UTF8 = { "content-type": "application/json; charset=utf-8" } as const;

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireAdmin(req, "Apenas administradores podem consultar o histórico de e-mails.");
  if (!auth.ok) return auth.response;
  try {
    const u = new URL(req.url);
    const limit = u.searchParams.get("limit") ? Number(u.searchParams.get("limit")) : 20;
    const items = await listEmailSendLogs(limit);
    return NextResponse.json({ ok: true, items }, { status: 200, headers: JSON_UTF8 });
  } catch (e) {
    return jsonAdminError(500, e instanceof Error ? e.message : "Falha ao listar histórico de e-mails.");
  }
}