import type { EmailOutboundConfig } from "@prisma/client";
import { prisma } from "@/glpi/config/prisma";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";

const CONFIG_ID = "default";

export type EmailOutboundStatus =
  | "NOT_CONFIGURED"
  | "CONFIGURED_UNTESTED"
  | "TEST_OK"
  | "ACTIVE"
  | "FAILED";

export type EmailSecurity = "NONE" | "STARTTLS" | "SSL_TLS";
export type EmailAuthMethod = "USER_PASS" | "APP_PASSWORD" | "OAUTH";

export type EmailOutboundPublicConfig = {
  active: boolean;
  status: EmailOutboundStatus;
  smtpHost: string;
  smtpPort: number;
  security: EmailSecurity;
  authRequired: boolean;
  username: string;
  /** true quando há senha gravada; o valor nunca é devolvido. */
  hasPassword: boolean;
  credentialConfigured: boolean;
  authMethod: EmailAuthMethod;
  oauthClientId: string;
  oauthTenantId: string;
  hasOauthRefreshToken: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  ccDefault: string;
  bccDefault: string;
  failureAlertEmail: string;
  subjectPrefix: string;
  footerSignature: string;
  confidentialityText: string;
  maxAttachmentBytes: number;
  maxRecipients: number;
  retryIntervalSec: number;
  maxRetries: number;
  attachNotificationPdf: boolean;
  attachmentsAsLink: boolean;
  requirePortalAccess: boolean;
  inboundEnabled: boolean;
  imapHost: string;
  imapPort: number;
  imapSecurity: EmailSecurity;
  imapUsername: string;
  hasImapPassword: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  lastTestRecipient: string | null;
  activationJustification: string | null;
  updatedAt: string;
};

export type EmailOutboundConfigInput = {
  smtpHost: string;
  smtpPort: number;
  security: EmailSecurity;
  authRequired: boolean;
  username: string;
  /** Omitir ou vazio = manter senha atual. */
  password?: string;
  authMethod: EmailAuthMethod;
  oauthClientId?: string | null;
  oauthTenantId?: string | null;
  oauthRefreshToken?: string | null;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  ccDefault?: string;
  bccDefault?: string;
  failureAlertEmail?: string;
  subjectPrefix?: string;
  footerSignature?: string;
  confidentialityText?: string;
  maxAttachmentBytes?: number;
  maxRecipients?: number;
  retryIntervalSec?: number;
  maxRetries?: number;
  attachNotificationPdf?: boolean;
  attachmentsAsLink?: boolean;
  requirePortalAccess?: boolean;
  /** Caixa de entrada permanece stub (sempre false na UI). */
  inboundEnabled?: boolean;
  imapHost?: string;
  imapPort?: number;
  imapSecurity?: EmailSecurity;
  imapUsername?: string;
  imapPassword?: string;
  active?: boolean;
  activationJustification?: string | null;
};

export type EmailSendLogItem = {
  id: string;
  type: string;
  recipients: string;
  status: string;
  attempts: number;
  errorSummary: string | null;
  createdAt: string;
};

function asStatus(raw: string | null | undefined): EmailOutboundStatus {
  const v = (raw ?? "NOT_CONFIGURED").toUpperCase();
  if (
    v === "NOT_CONFIGURED" ||
    v === "CONFIGURED_UNTESTED" ||
    v === "TEST_OK" ||
    v === "ACTIVE" ||
    v === "FAILED"
  ) {
    return v;
  }
  return "NOT_CONFIGURED";
}

function asSecurity(raw: string | null | undefined, fallback: EmailSecurity = "STARTTLS"): EmailSecurity {
  const v = (raw ?? fallback).toUpperCase();
  if (v === "NONE" || v === "STARTTLS" || v === "SSL_TLS") return v;
  return fallback;
}

function asAuthMethod(raw: string | null | undefined): EmailAuthMethod {
  const v = (raw ?? "USER_PASS").toUpperCase();
  if (v === "USER_PASS" || v === "APP_PASSWORD" || v === "OAUTH") return v;
  return "USER_PASS";
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value as number)));
}

function looksConfigured(row: EmailOutboundConfig): boolean {
  return Boolean(row.smtpHost.trim() && row.fromEmail.trim() && row.smtpPort > 0);
}

function toPublic(row: EmailOutboundConfig): EmailOutboundPublicConfig {
  const hasPassword = Boolean(row.passwordEnc);
  return {
    active: row.active,
    status: asStatus(row.status),
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    security: asSecurity(row.security),
    authRequired: row.authRequired,
    username: row.username,
    hasPassword,
    credentialConfigured: hasPassword,
    authMethod: asAuthMethod(row.authMethod),
    oauthClientId: row.oauthClientId ?? "",
    oauthTenantId: row.oauthTenantId ?? "",
    hasOauthRefreshToken: Boolean(row.oauthRefreshTokenEnc),
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    replyTo: row.replyTo,
    ccDefault: row.ccDefault,
    bccDefault: row.bccDefault,
    failureAlertEmail: row.failureAlertEmail,
    subjectPrefix: row.subjectPrefix,
    footerSignature: row.footerSignature,
    confidentialityText: row.confidentialityText,
    maxAttachmentBytes: row.maxAttachmentBytes,
    maxRecipients: row.maxRecipients,
    retryIntervalSec: row.retryIntervalSec,
    maxRetries: row.maxRetries,
    attachNotificationPdf: row.attachNotificationPdf,
    attachmentsAsLink: row.attachmentsAsLink,
    requirePortalAccess: row.requirePortalAccess,
    inboundEnabled: false,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    imapSecurity: asSecurity(row.imapSecurity, "SSL_TLS"),
    imapUsername: row.imapUsername,
    hasImapPassword: Boolean(row.imapPasswordEnc),
    lastTestAt: row.lastTestAt?.toISOString() ?? null,
    lastTestOk: row.lastTestOk,
    lastTestError: row.lastTestError,
    lastTestRecipient: row.lastTestRecipient,
    activationJustification: row.activationJustification,
    updatedAt: row.updatedAt.toISOString()
  };
}

async function ensureRow(): Promise<EmailOutboundConfig> {
  return prisma.emailOutboundConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID },
    update: {}
  });
}

export async function getEmailOutboundPublicConfig(): Promise<EmailOutboundPublicConfig> {
  const row = await ensureRow();
  return toPublic(row);
}

export async function updateEmailOutboundConfig(
  input: EmailOutboundConfigInput,
  actorUserId?: string
): Promise<EmailOutboundPublicConfig> {
  const current = await ensureRow();

  const smtpHost = String(input.smtpHost ?? "").trim();
  const fromEmail = String(input.fromEmail ?? "").trim();
  const smtpPort = clampInt(input.smtpPort, 1, 65535, 587);
  const security = asSecurity(input.security);
  const authMethod = asAuthMethod(input.authMethod);
  const authRequired = Boolean(input.authRequired);

  let passwordEnc = current.passwordEnc;
  const passwordIncoming = typeof input.password === "string" ? input.password.trim() : "";
  if (passwordIncoming) {
    passwordEnc = encryptSecret(passwordIncoming);
  }

  let oauthRefreshTokenEnc = current.oauthRefreshTokenEnc;
  const oauthTokenIncoming =
    typeof input.oauthRefreshToken === "string" ? input.oauthRefreshToken.trim() : "";
  if (oauthTokenIncoming) {
    oauthRefreshTokenEnc = encryptSecret(oauthTokenIncoming);
  }

  let imapPasswordEnc = current.imapPasswordEnc;
  const imapPasswordIncoming =
    typeof input.imapPassword === "string" ? input.imapPassword.trim() : "";
  if (imapPasswordIncoming) {
    imapPasswordEnc = encryptSecret(imapPasswordIncoming);
  }

  const wantActive = Boolean(input.active);
  let status = asStatus(current.status);
  let activationJustification = current.activationJustification;
  let active = current.active;
  const nextConfigured = Boolean(smtpHost && fromEmail);

  if (wantActive && !current.active) {
    const testOk = current.lastTestOk === true || status === "TEST_OK" || status === "ACTIVE";
    const justification = String(input.activationJustification ?? "").trim();
    if (!testOk && justification.length < 10) {
      throw new Error(
        "Para ativar sem teste OK, informe uma justificativa excepcional com pelo menos 10 caracteres. Recomendado: enviar e-mail de teste com sucesso antes."
      );
    }
    if (!looksConfigured({ ...current, smtpHost, fromEmail, smtpPort } as EmailOutboundConfig)) {
      throw new Error("Configure host SMTP e e-mail do remetente antes de ativar.");
    }
    active = true;
    status = "ACTIVE";
    activationJustification = testOk ? null : justification;
  } else if (!wantActive) {
    active = false;
    if (status === "ACTIVE") {
      status = current.lastTestOk ? "TEST_OK" : nextConfigured ? "CONFIGURED_UNTESTED" : "NOT_CONFIGURED";
    } else if (!nextConfigured) {
      status = "NOT_CONFIGURED";
    } else if (status === "NOT_CONFIGURED") {
      status = "CONFIGURED_UNTESTED";
    }
    // Mantém TEST_OK / FAILED / CONFIGURED_UNTESTED quando já houver resultado de teste.
  } else if (wantActive && current.active) {
    active = true;
    status = "ACTIVE";
  }

  const updated = await prisma.emailOutboundConfig.update({
    where: { id: CONFIG_ID },
    data: {
      smtpHost,
      smtpPort,
      security,
      authRequired,
      username: String(input.username ?? "").trim(),
      passwordEnc,
      authMethod,
      oauthClientId: input.oauthClientId?.trim() || null,
      oauthTenantId: input.oauthTenantId?.trim() || null,
      oauthRefreshTokenEnc,
      fromName: String(input.fromName ?? "").trim(),
      fromEmail,
      replyTo: String(input.replyTo ?? "").trim(),
      ccDefault: String(input.ccDefault ?? "").trim(),
      bccDefault: String(input.bccDefault ?? "").trim(),
      failureAlertEmail: String(input.failureAlertEmail ?? "").trim(),
      subjectPrefix: String(input.subjectPrefix ?? "").trim(),
      footerSignature: String(input.footerSignature ?? ""),
      confidentialityText: String(input.confidentialityText ?? ""),
      maxAttachmentBytes: clampInt(input.maxAttachmentBytes, 0, 100 * 1024 * 1024, 10 * 1024 * 1024),
      maxRecipients: clampInt(input.maxRecipients, 1, 500, 50),
      retryIntervalSec: clampInt(input.retryIntervalSec, 5, 3600, 60),
      maxRetries: clampInt(input.maxRetries, 0, 20, 3),
      attachNotificationPdf: Boolean(input.attachNotificationPdf),
      attachmentsAsLink: Boolean(input.attachmentsAsLink),
      requirePortalAccess: Boolean(input.requirePortalAccess),
      inboundEnabled: false,
      imapHost: String(input.imapHost ?? "").trim(),
      imapPort: clampInt(input.imapPort, 1, 65535, 993),
      imapSecurity: asSecurity(input.imapSecurity, "SSL_TLS"),
      imapUsername: String(input.imapUsername ?? "").trim(),
      imapPasswordEnc,
      active,
      status,
      activationJustification
    }
  });

  try {
    await prisma.auditLog.create({
      data: {
        entity: "EmailOutboundConfig",
        entityId: CONFIG_ID,
        action: "UPDATE",
        userId: actorUserId?.trim() || "system",
        oldData: {
          status: current.status,
          active: current.active,
          smtpHost: current.smtpHost,
          fromEmail: current.fromEmail
        },
        newData: {
          status: updated.status,
          active: updated.active,
          smtpHost: updated.smtpHost,
          fromEmail: updated.fromEmail,
          credentialConfigured: Boolean(updated.passwordEnc)
        }
      }
    });
  } catch {
    // Não falha o save se a auditoria estiver indisponível.
  }

  return toPublic(updated);
}

function sanitizeErrorMessage(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err);
  msg = msg.replace(/pass(word)?[=:]\s*\S+/gi, "password=[redacted]");
  msg = msg.replace(/auth[=:]\s*\S+/gi, "auth=[redacted]");
  if (msg.length > 500) msg = `${msg.slice(0, 500)}…`;
  return msg || "Falha desconhecida ao testar SMTP.";
}

export async function testEmailOutbound(input: {
  to: string;
  actorUserId?: string;
}): Promise<{
  ok: boolean;
  message: string;
  config: EmailOutboundPublicConfig;
  logId: string;
}> {
  const to = String(input.to ?? "").trim();
  if (!to || !to.includes("@")) {
    throw new Error("Informe um e-mail de destino válido para o teste.");
  }

  const row = await ensureRow();
  if (!looksConfigured(row)) {
    throw new Error("Salve host SMTP e e-mail do remetente antes de testar.");
  }

  let password = "";
  if (row.passwordEnc) {
    try {
      password = decryptSecret(row.passwordEnc);
    } catch {
      throw new Error("Não foi possível descriptografar a credencial SMTP. Salve a senha novamente.");
    }
  }

  const fromAddress = row.fromName.trim()
    ? `${row.fromName.trim()} <${row.fromEmail.trim()}>`
    : row.fromEmail.trim();
  const subjectPrefix = row.subjectPrefix.trim();
  const subject = `${subjectPrefix ? `${subjectPrefix} ` : ""}[SIGTI] E-mail de teste`;

  let ok = false;
  let message = "";
  let attempts = 1;

  try {
    // Import dinâmico: se a dependência falhar, registramos o resultado sem vazar segredos.
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
          ? {
              user: row.username,
              pass: password
            }
          : undefined,
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 20_000
    });

    await transporter.sendMail({
      from: fromAddress,
      to,
      replyTo: row.replyTo.trim() || undefined,
      cc: row.ccDefault.trim() || undefined,
      bcc: row.bccDefault.trim() || undefined,
      subject,
      text: [
        "Este é um e-mail de teste enviado pela configuração SMTP do SIGTI.",
        "",
        row.footerSignature.trim(),
        row.confidentialityText.trim()
      ]
        .filter(Boolean)
        .join("\n"),
      html: `<p>Este é um e-mail de teste enviado pela configuração SMTP do SIGTI.</p>${
        row.footerSignature.trim() ? `<p>${escapeHtml(row.footerSignature)}</p>` : ""
      }${
        row.confidentialityText.trim()
          ? `<p><small>${escapeHtml(row.confidentialityText)}</small></p>`
          : ""
      }`
    });
    ok = true;
    message = `E-mail de teste enviado com sucesso para ${to}.`;
  } catch (err) {
    ok = false;
    const raw = sanitizeErrorMessage(err);
    if (/Cannot find module ['"]nodemailer['"]/i.test(String(err))) {
      message =
        "Dependência nodemailer indisponível neste ambiente. Resultado registrado como falha; instale a dependência e teste novamente.";
    } else if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|certificate|TLS|SSL/i.test(raw)) {
      message = `Falha de rede/TLS ao contactar o SMTP: ${raw}`;
    } else {
      message = `Falha no teste SMTP: ${raw}`;
    }
  }

  const updated = await prisma.emailOutboundConfig.update({
    where: { id: CONFIG_ID },
    data: {
      lastTestAt: new Date(),
      lastTestOk: ok,
      lastTestError: ok ? null : message,
      lastTestRecipient: to,
      status: ok ? (row.active ? "ACTIVE" : "TEST_OK") : "FAILED",
      active: ok ? row.active : false
    }
  });

  const log = await prisma.emailSendLog.create({
    data: {
      type: "TEST",
      recipients: to,
      status: ok ? "SENT" : "FAILED",
      attempts,
      errorSummary: ok ? null : message
    }
  });

  try {
    await prisma.auditLog.create({
      data: {
        entity: "EmailOutboundConfig",
        entityId: CONFIG_ID,
        action: "TEST",
        userId: input.actorUserId?.trim() || "system",
        oldData: { status: row.status },
        newData: { status: updated.status, ok, recipient: to }
      }
    });
  } catch {
    // ignore
  }

  return { ok, message, config: toPublic(updated), logId: log.id };
}

export async function listEmailSendLogs(limit = 20): Promise<EmailSendLogItem[]> {
  const take = clampInt(limit, 1, 100, 20);
  const rows = await prisma.emailSendLog.findMany({
    orderBy: { createdAt: "desc" },
    take
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    recipients: r.recipients,
    status: r.status,
    attempts: r.attempts,
    errorSummary: r.errorSummary,
    createdAt: r.createdAt.toISOString()
  }));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
