import * as bcrypt from "bcrypt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/glpi/config/prisma";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import { issueAuthToken } from "@/lib/auth-issue-token";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { verifyBearerToken } from "@/lib/verify-bearer-session";
import { gestaoUserAccess } from "@/server/gestao/gestao-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChangePasswordBody = {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  /** Token da sessão (cookie/Authorization podem falhar atrás de proxy). */
  accessToken?: string;
};

function requestIp(req: Request): string | null {
  const raw = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  return raw?.split(",")[0]?.trim() || null;
}

function readTokenFromHeaderOrCookie(req: NextRequest): string {
  const header = req.headers.get("authorization")?.trim() ?? "";
  if (header.toLowerCase().startsWith("bearer ")) {
    const bearer = header.slice(7).trim();
    if (bearer) return bearer;
  }
  return req.cookies.get(GTI_TOKEN_COOKIE)?.value?.trim() || "";
}

function cookieSecure(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return proto === "https" || proto == null;
}

async function auditAccess(input: {
  userId: string;
  email: string;
  role: string;
  eventType: string;
  pathLabel: string;
  req: NextRequest;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await gestaoUserAccess.record({
      actor: {
        userId: input.userId,
        email: input.email,
        role: input.role as UserRole
      },
      eventType: input.eventType,
      path: "/trocar-senha",
      pathLabel: input.pathLabel,
      ipAddress: requestIp(input.req),
      userAgent: input.req.headers.get("user-agent"),
      metadata: input.metadata
    });
  } catch (err) {
    console.warn("[user-access] falha ao registrar evento de senha", err);
  }
  try {
    await prisma.auditLog.create({
      data: {
        entity: "User",
        entityId: input.userId,
        action: input.eventType,
        userId: input.userId,
        newData: {
          pathLabel: input.pathLabel,
          ...(input.metadata ?? {})
        }
      }
    });
  } catch (err) {
    console.warn("[audit] falha ao registrar evento de senha", err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ChangePasswordBody;
  try {
    body = (await req.json()) as ChangePasswordBody;
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido" }, { status: 400 });
  }

  const tokenFromBody = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  const token = tokenFromBody || readTokenFromHeaderOrCookie(req);
  if (!token) {
    return NextResponse.json(
      { error: "Não autenticado. Faça login novamente para definir a nova senha." },
      { status: 401 }
    );
  }

  let session: Awaited<ReturnType<typeof verifyBearerToken>>;
  try {
    session = await verifyBearerToken(token);
  } catch {
    return NextResponse.json(
      { error: "Sessão inválida ou expirada. Faça login novamente." },
      { status: 401 }
    );
  }

  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || user.email !== session.email) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const mandatoryChange = user.mustChangePassword === true || session.mustChangePassword === true;

  if (newPassword !== confirmPassword) {
    if (mandatoryChange) {
      await auditAccess({
        userId: user.id,
        email: user.email,
        role: user.role,
        eventType: "PASSWORD_MANDATORY_CHANGE_FAILED",
        pathLabel: "Falha na troca obrigatória (senhas não coincidem)",
        req,
        metadata: { reason: "mismatch" }
      });
    }
    return NextResponse.json({ error: "As senhas não coincidem." }, { status: 400 });
  }

  const policy = validatePasswordPolicy(newPassword);
  if (!policy.ok) {
    if (mandatoryChange) {
      await auditAccess({
        userId: user.id,
        email: user.email,
        role: user.role,
        eventType: "PASSWORD_MANDATORY_CHANGE_FAILED",
        pathLabel: "Falha na troca obrigatória (política de senha)",
        req,
        metadata: { reason: "policy" }
      });
    }
    return NextResponse.json({ error: policy.message }, { status: 400 });
  }

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";

  if (!mandatoryChange) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Informe a senha atual." }, { status: 400 });
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Senha atual inválida." }, { status: 400 });
    }
  }

  const sameAsCurrent = await bcrypt.compare(newPassword, user.passwordHash);
  if (sameAsCurrent) {
    return NextResponse.json(
      { error: "A nova senha deve ser diferente da senha provisória/atual." },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
    select: {
      id: true,
      email: true,
      role: true,
      mustChangePassword: true,
      userKind: true
    }
  });
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

  if (mandatoryChange) {
    await auditAccess({
      userId: updated.id,
      email: updated.email,
      role: updated.role,
      eventType: "PASSWORD_MANDATORY_CHANGE",
      pathLabel: "Troca obrigatória concluída",
      req
    });
  }

  const { access_token } = await issueAuthToken({
    id: updated.id,
    email: updated.email,
    role: updated.role,
    mustChangePassword: false
  });

  const home =
    updated.userKind === "EXTERNAL" ? "/externo/notificacoes" : "/dashboard";

  const res = NextResponse.json({
    ok: true,
    message: "Senha alterada com sucesso.",
    access_token,
    redirectTo: home,
    user: {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      mustChangePassword: false,
      userKind: updated.userKind
    }
  });
  res.cookies.set(GTI_TOKEN_COOKIE, access_token, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
    httpOnly: false,
    secure: cookieSecure(req)
  });
  return res;
}
