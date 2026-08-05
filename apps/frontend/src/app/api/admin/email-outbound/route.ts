import { NextResponse } from "next/server";
import {
  getEmailOutboundPublicConfig,
  updateEmailOutboundConfig,
  type EmailAuthMethod,
  type EmailOutboundConfigInput,
  type EmailSecurity
} from "@/server/admin/email-outbound";
import { jsonAdminError, requireAdmin } from "@/server/admin/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_UTF8 = { "content-type": "application/json; charset=utf-8" } as const;

function asSecurity(raw: unknown, fallback: EmailSecurity): EmailSecurity {
  const v = String(raw ?? fallback).toUpperCase();
  if (v === "NONE" || v === "STARTTLS" || v === "SSL_TLS") return v;
  return fallback;
}

function asAuthMethod(raw: unknown): EmailAuthMethod {
  const v = String(raw ?? "USER_PASS").toUpperCase();
  if (v === "USER_PASS" || v === "APP_PASSWORD" || v === "OAUTH") return v;
  return "USER_PASS";
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireAdmin(req, "Apenas administradores podem gerir a configuração de e-mail.");
  if (!auth.ok) return auth.response;
  try {
    const config = await getEmailOutboundPublicConfig();
    return NextResponse.json({ ok: true, ...config }, { status: 200, headers: JSON_UTF8 });
  } catch (e) {
    return jsonAdminError(500, e instanceof Error ? e.message : "Falha ao obter configuração de e-mail.");
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
  const auth = await requireAdmin(req, "Apenas administradores podem gerir a configuração de e-mail.");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonAdminError(400, "JSON inválido.");
  }
  if (!body || typeof body !== "object") {
    return jsonAdminError(400, "Corpo inválido.");
  }

  const b = body as Record<string, unknown>;
  const input: EmailOutboundConfigInput = {
    smtpHost: String(b.smtpHost ?? ""),
    smtpPort: Number(b.smtpPort ?? 587),
    security: asSecurity(b.security, "STARTTLS"),
    authRequired: b.authRequired === undefined ? true : Boolean(b.authRequired),
    username: String(b.username ?? ""),
    password: typeof b.password === "string" ? b.password : undefined,
    authMethod: asAuthMethod(b.authMethod),
    oauthClientId: b.oauthClientId == null ? null : String(b.oauthClientId),
    oauthTenantId: b.oauthTenantId == null ? null : String(b.oauthTenantId),
    oauthRefreshToken: typeof b.oauthRefreshToken === "string" ? b.oauthRefreshToken : undefined,
    fromName: String(b.fromName ?? ""),
    fromEmail: String(b.fromEmail ?? ""),
    replyTo: String(b.replyTo ?? ""),
    ccDefault: String(b.ccDefault ?? ""),
    bccDefault: String(b.bccDefault ?? ""),
    failureAlertEmail: String(b.failureAlertEmail ?? ""),
    subjectPrefix: String(b.subjectPrefix ?? ""),
    footerSignature: String(b.footerSignature ?? ""),
    confidentialityText: String(b.confidentialityText ?? ""),
    maxAttachmentBytes: Number(b.maxAttachmentBytes ?? 10_485_760),
    maxRecipients: Number(b.maxRecipients ?? 50),
    retryIntervalSec: Number(b.retryIntervalSec ?? 60),
    maxRetries: Number(b.maxRetries ?? 3),
    attachNotificationPdf: Boolean(b.attachNotificationPdf),
    attachmentsAsLink: Boolean(b.attachmentsAsLink),
    requirePortalAccess: Boolean(b.requirePortalAccess),
    inboundEnabled: false,
    imapHost: String(b.imapHost ?? ""),
    imapPort: Number(b.imapPort ?? 993),
    imapSecurity: asSecurity(b.imapSecurity, "SSL_TLS"),
    imapUsername: String(b.imapUsername ?? ""),
    imapPassword: typeof b.imapPassword === "string" ? b.imapPassword : undefined,
    active: Boolean(b.active),
    activationJustification:
      b.activationJustification == null ? null : String(b.activationJustification)
  };

  try {
    const config = await updateEmailOutboundConfig(input, auth.session.sub);
    return NextResponse.json({ ok: true, ...config }, { status: 200, headers: JSON_UTF8 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao salvar configuração de e-mail.";
    const status =
      message.includes("Para ativar") ||
      message.includes("Configure host") ||
      message.includes("justificativa")
        ? 400
        : 500;
    return jsonAdminError(status, message);
  }
}
