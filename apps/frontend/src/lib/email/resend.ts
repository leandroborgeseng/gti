type SendEmailInput = {
  to: string;
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
  return process.env.RESEND_FROM?.trim() || "GTI <onboarding@resend.dev>";
}

function resendApiKey(): string {
  return process.env.RESEND_API_KEY?.trim() ?? "";
}

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(resendApiKey());
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
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
    throw new Error(detail || `Falha ao enviar e-mail pelo Resend (HTTP ${response.status})`);
  }
}
