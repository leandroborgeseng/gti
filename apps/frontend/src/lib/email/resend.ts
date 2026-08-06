import { BRAND } from "@/lib/brand";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

type ResendErrorPayload = {
  message?: string;
  error?: string;
  name?: string;
};

function emailFrom(): string {
  return process.env.RESEND_FROM?.trim() || `${BRAND.emailFromName} <onboarding@resend.dev>`;
}

function resendApiKey(): string {
  return process.env.RESEND_API_KEY?.trim() ?? "";
}

export function isResendConfigured(): boolean {
  return Boolean(resendApiKey());
}

/** @deprecated Prefira `isResendConfigured` ou o sender unificado `sendMail`. */
export function isEmailDeliveryConfigured(): boolean {
  return isResendConfigured();
}

/**
 * Envio direto pela API Resend (sem log). Preferir `sendMail` de `@/lib/email/send-mail`.
 */
export async function sendResendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  const apiKey = resendApiKey();
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY não configurada; e-mail não enviado", { to, subject });
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: emailFrom(),
      to,
      subject,
      html,
      text
    })
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as ResendErrorPayload;
      detail = payload.message ?? payload.error ?? payload.name ?? "";
    } catch {
      detail = await response.text().catch(() => "");
    }
    const safe = detail.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
    throw new Error(safe || `Falha ao enviar e-mail pelo Resend (HTTP ${response.status})`);
  }
}

/** @deprecated Prefira `sendMail` (`@/lib/email/send-mail`) ou `sendResendEmail`. */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  await sendResendEmail(input);
}
