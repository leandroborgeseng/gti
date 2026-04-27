import * as bcrypt from "bcrypt";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/glpi/config/prisma";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import { issueAuthToken } from "@/lib/auth-issue-token";
import { verifyBearerToken } from "@/lib/verify-bearer-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const token = cookies().get(GTI_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let session: Awaited<ReturnType<typeof verifyBearerToken>>;
  try {
    session = await verifyBearerToken(token);
  } catch {
    return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await req.json()) as { currentPassword?: string; newPassword?: string };
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido" }, { status: 400 });
  }

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || newPassword.length < 8) {
    return NextResponse.json({ error: "Informe a senha atual e uma nova senha com pelo menos 8 caracteres." }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "A nova senha deve ser diferente da senha atual." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || user.email !== session.email) {
    return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Senha atual inválida." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
    select: { id: true, email: true, role: true, mustChangePassword: true }
  });
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

  const { access_token } = await issueAuthToken(updated);
  const res = NextResponse.json({ ok: true, message: "Senha alterada com sucesso." });
  res.cookies.set(GTI_TOKEN_COOKIE, access_token, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production"
  });
  return res;
}
