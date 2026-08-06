import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import { verifyBearerToken } from "@/lib/verify-bearer-session";
import { authHeadersForApi } from "@/lib/auth-token";
import { getBackendApiBaseUrl } from "@/lib/api";
import { notificationPortalAbsoluteUrl, sendMail } from "@/lib/email/send-mail";

/**
 * Envia notificação: prepare no BFF → send-mail unificado → confirm-send.
 * Body: { notificationId, extraEmails? }
 */
export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const token = bearer || cookies().get(GTI_TOKEN_COOKIE)?.value || "";
  if (!token) {
    return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
  }
  try {
    const session = await verifyBearerToken(token);
    if (session.role !== "ADMIN" && session.role !== "EDITOR") {
      return NextResponse.json({ message: "Sem permissão para enviar notificações." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ message: "Sessão inválida." }, { status: 401 });
  }

  let body: { notificationId?: string; extraEmails?: string[] };
  try {
    body = (await req.json()) as { notificationId?: string; extraEmails?: string[] };
  } catch {
    return NextResponse.json({ message: "JSON inválido." }, { status: 400 });
  }
  const notificationId = body.notificationId?.trim();
  if (!notificationId) {
    return NextResponse.json({ message: "Informe notificationId." }, { status: 400 });
  }

  const apiBase = getBackendApiBaseUrl() || `${new URL(req.url).origin}/api`;
  const authHeaders = await authHeadersForApi();

  const prepRes = await fetch(`${apiBase}/contract-notifications/${notificationId}/prepare-send`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ extraEmails: body.extraEmails ?? [] }),
    cache: "no-store"
  });
  if (!prepRes.ok) {
    const err = (await prepRes.json().catch(() => ({}))) as { message?: string };
    return NextResponse.json(
      { message: err.message || "Falha ao preparar envio." },
      { status: prepRes.status }
    );
  }
  const prep = (await prepRes.json()) as {
    recipients: string[];
    subject: string;
    html: string;
    number: string;
    portalPath: string;
  };

  const portalUrl = notificationPortalAbsoluteUrl(prep.portalPath);
  const html = `${prep.html}
    <hr/>
    <p>Acesse a área externa autenticada: <a href="${portalUrl}">${portalUrl}</a></p>`;

  const sent = await sendMail({
    to: prep.recipients,
    subject: prep.subject || prep.number,
    html,
    log: false,
    logType: "NOTIFICATION"
  });

  const confirmRes = await fetch(`${apiBase}/contract-notifications/${notificationId}/confirm-send`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipients: sent.recipients,
      emailStatus: sent.ok ? "SENT" : "FAILED",
      errorSummary: sent.errorSummary
    }),
    cache: "no-store"
  });

  if (!confirmRes.ok) {
    const err = (await confirmRes.json().catch(() => ({}))) as { message?: string };
    return NextResponse.json(
      {
        message: err.message || "E-mail processado, mas falha ao confirmar status.",
        send: sent
      },
      { status: confirmRes.status }
    );
  }

  const notification = await confirmRes.json();
  return NextResponse.json({ ok: sent.ok, send: sent, notification });
}
