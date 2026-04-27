import { randomBytes, createHash } from "node:crypto";
import * as bcrypt from "bcrypt";
import { prisma } from "@/glpi/config/prisma";
import { publicSiteUrl } from "@/lib/site-url";
import { sendEmail } from "@/lib/email/resend";

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 60;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function resetUrl(token: string): string {
  const url = new URL("/resetar-senha", publicSiteUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

async function createPasswordResetToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(RESET_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: tokenHash(token),
      expiresAt
    }
  });
  return { token, expiresAt };
}

async function sendPasswordResetEmail(input: { email: string; token: string; isWelcome?: boolean }): Promise<void> {
  const url = resetUrl(input.token);
  const subject = input.isWelcome ? "A sua conta no GTI foi criada" : "Redefinição de senha do GTI";
  const title = input.isWelcome ? "Bem-vindo ao GTI" : "Redefina a sua senha";
  const intro = input.isWelcome
    ? "A sua conta no sistema GTI foi criada. Use o botão abaixo para definir a sua senha de acesso."
    : "Recebemos uma solicitação para redefinir a senha da sua conta no sistema GTI.";
  const text = `${intro}\n\nAcesse: ${url}\n\nEste link expira em ${RESET_TOKEN_TTL_MINUTES} minutos.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h1 style="font-size: 20px;">${title}</h1>
      <p>${intro}</p>
      <p>
        <a href="${url}" style="display: inline-block; background: #111827; color: #ffffff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">
          Definir senha
        </a>
      </p>
      <p style="font-size: 13px; color: #4b5563;">Este link expira em ${RESET_TOKEN_TTL_MINUTES} minutos.</p>
      <p style="font-size: 13px; color: #4b5563;">Se não reconhece esta solicitação, ignore este e-mail.</p>
    </div>
  `;
  await sendEmail({ to: input.email, subject, html, text });
}

export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  const user = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true, email: true } });
  if (!user) return;
  const { token } = await createPasswordResetToken(user.id);
  await sendPasswordResetEmail({ email: user.email, token });
}

export async function sendWelcomePasswordEmail(user: { id: string; email: string }): Promise<void> {
  const { token } = await createPasswordResetToken(user.id);
  await sendPasswordResetEmail({ email: user.email, token, isWelcome: true });
}

export async function resetPasswordWithToken(token: string, password: string): Promise<void> {
  const hash = tokenHash(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true }
  });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new Error("TOKEN_INVALIDO");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.deleteMany({
      where: {
        userId: record.userId,
        usedAt: null,
        id: { not: record.id }
      }
    })
  ]);
}
