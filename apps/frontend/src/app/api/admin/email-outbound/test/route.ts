import { NextResponse } from "next/server";
import { testEmailOutbound } from "@/server/admin/email-outbound";
import { jsonAdminError, requireAdmin } from "@/server/admin/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_UTF8 = { "content-type": "application/json; charset=utf-8" } as const;

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireAdmin(req, "Apenas administradores podem testar o envio de e-mail.");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonAdminError(400, "JSON inválido.");
  }
  const to = body && typeof body === "object" ? String((body as { to?: unknown }).to ?? "") : "";

  try {
    const result = await testEmailOutbound({ to, actorUserId: auth.session.sub });
    return NextResponse.json(
      {
        ok: result.ok,
        message: result.message,
        logId: result.logId,
        config: result.config
      },
      { status: 200, headers: JSON_UTF8 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao testar e-mail.";
    const status = message.includes("Informe") || message.includes("Salve host") ? 400 : 500;
    return jsonAdminError(status, message);
  }
}
