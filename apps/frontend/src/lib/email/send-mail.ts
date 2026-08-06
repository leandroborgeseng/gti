/**
 * Remetente unificado: SMTP ACTIVE (Administração) tem prioridade; senão Resend.
 */
import { prisma } from "@/glpi/config/prisma";
import { decryptSecret } from "@/lib/secret-crypto";
import { BRAND } from "@/lib/brand";
import { isEmailDeliveryConfigured, sendEmail as sendViaResend } from "@/lib/email/resend";

export type UnifiedSendMailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  /** Grava EmailSendLog (padrão: true). */
  log?: boolean;
  logType?: "TEST" | "SYSTEM" | "NOTIFICATION" | "OTHER" | "PASSWORD_RESET" | "WELCOME";
};

export type UnifiedSendMailResult = {
  ok: boolean;
  channel: "SMTP" | "RESEND" | "NONE";
  recipients: string[];
  errorSummary?: string;
  logId?: string;
};

function toList(to: string | string[]): string[] {
  const arr = Array.isArray(to) ? to : [to];
  return [...new Set(arr.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeMailError(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err);
  msg = msg.replace(/pass(word)?[=:]\s*\S+/gi, "password=[redacted]");
  msg = msg.replace(/auth[=:]\s*\S+/gi, "auth=[redacted]");
  msg = msg.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  if (msg.length > 500) msg = `${msg.slice(0, 500)}…`;
  return msg || "Falha desconhecida ao enviar e-mail.";
}

async function sendViaSmtpActive(input: {
  recipients: string[];
  subject: string;
  html: string;
  text: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const row = await prisma.emailOutboundConfig.findUnique({ where: { id: "default" } });
  if (!row || !row.active || row.status !== "ACTIVE" || !row.smtpHost.trim() || !row.fromEmail.trim()) {
    return { ok: false, error: "SMTP não ativo" };
  }
  if (row.authRequired && !row.passwordEnc) {
    return { ok: false, error: "SMTP ativo sem credencial configurada" };
  }

  let password = "";
  if (row.passwordEnc) {
    try {
      password = decryptSecret(row.passwordEnc);
    } catch {
      return { ok: false, error: "Falha ao descriptografar senha SMTP" };
    }
  }

  try {
    const nodemailer = await import("nodemailer");
    const secure = row.security === "SSL_TLS";
    const requireTLS = row.security === "STARTTLS";
    const transporter = nodemailer.createTransport({
      host: row.smtpHost,
      port: row.smtpPort,
      secure,
      requireTLS: requireTLS || undefined,
      auth:
        row.authRequired && row.username
          ? { user: row.username, pass: password }
          : undefined,
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 20_000
    });

    const fromAddress = row.fromName.trim()
      ? `${row.fromName.trim()} <${row.fromEmail.trim()}>`
      : row.fromEmail.trim();
    const prefix = row.subjectPrefix.trim();
    const subject = `${prefix ? `${prefix} ` : ""}${input.subject}`;

    await transporter.sendMail({
      from: fromAddress,
      to: input.recipients.join(", "),
      replyTo: input.replyTo?.trim() || row.replyTo.trim() || undefined,
      cc: input.cc?.trim() || row.ccDefault.trim() || undefined,
      bcc: input.bcc?.trim() || row.bccDefault.trim() || undefined,
      subject,
      text: [input.text, row.footerSignature.trim(), row.confidentialityText.trim()].filter(Boolean).join("\n\n"),
      html: input.html
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: sanitizeMailError(err) };
  }
}

/**
 * Envia e-mail: tenta SMTP ACTIVE; se indisponível, usa Resend; senão registra falha.
 */
export async function sendMail(input: UnifiedSendMailInput): Promise<UnifiedSendMailResult> {
  const recipients = toList(input.to);
  if (recipients.length === 0) {
    return { ok: false, channel: "NONE", recipients: [], errorSummary: "Nenhum destinatário válido." };
  }

  const text = input.text?.trim() || htmlToText(input.html);
  const smtp = await sendViaSmtpActive({
    recipients,
    subject: input.subject,
    html: input.html,
    text,
    cc: input.cc,
    bcc: input.bcc,
    replyTo: input.replyTo
  });

  let channel: UnifiedSendMailResult["channel"] = "NONE";
  let ok = false;
  let errorSummary: string | undefined;

  if (smtp.ok) {
    channel = "SMTP";
    ok = true;
  } else if (isEmailDeliveryConfigured()) {
    try {
      for (const to of recipients) {
        await sendViaResend({
          to,
          subject: input.subject,
          html: input.html,
          text
        });
      }
      channel = "RESEND";
      ok = true;
    } catch (err) {
      channel = "RESEND";
      ok = false;
      errorSummary = sanitizeMailError(err);
    }
  } else {
    channel = "NONE";
    ok = false;
    errorSummary =
      smtp.error && smtp.error !== "SMTP não ativo"
        ? smtp.error
        : "Nenhum canal de e-mail disponível (SMTP ACTIVE ou RESEND_API_KEY).";
    console.warn("[send-mail]", errorSummary, { subject: input.subject, recipients });
  }

  let logId: string | undefined;
  if (input.log !== false) {
    try {
      const log = await prisma.emailSendLog.create({
        data: {
          type: input.logType ?? "SYSTEM",
          recipients: recipients.join(", "),
          status: ok ? "SENT" : "FAILED",
          attempts: 1,
          errorSummary: errorSummary ?? null
        }
      });
      logId = log.id;
    } catch {
      /* ignore */
    }
  }

  return { ok, channel, recipients, errorSummary, logId };
}

export function notificationPortalAbsoluteUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base.replace(/\/$/, "")}${p}` : p;
}

export function brandFromLabel(): string {
  return BRAND.emailFromName;
}
