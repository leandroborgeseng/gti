import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { loginWithDatabase } from "@/lib/auth-issue-token";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import { ensureBootstrapAdminIfNoUsers } from "@/lib/ensure-bootstrap-admin";
import { prisma } from "@/glpi/config/prisma";
import { gestaoUserAccess } from "@/server/gestao/gestao-services";

function requestIp(req: Request): string | null {
  const raw = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  return raw?.split(",")[0]?.trim() || null;
}

function cookieSecure(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return proto === "https" || proto == null;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as { email?: string; password?: string };
  } catch {
    return new NextResponse("Corpo JSON inválido", { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email.trim() || !password) {
    return new NextResponse("Credenciais inválidas", { status: 401 });
  }

  try {
    await ensureBootstrapAdminIfNoUsers();
    const { access_token, expires_in, user } = await loginWithDatabase(email, password);

    const provisional = user.mustChangePassword === true;
    void gestaoUserAccess
      .record({
        actor: { userId: user.id, email: user.email, role: user.role as UserRole },
        eventType: provisional ? "LOGIN_PROVISIONAL" : "LOGIN",
        path: "/login",
        pathLabel: provisional ? "Login com senha provisória" : "Login",
        ipAddress: requestIp(req),
        userAgent: req.headers.get("user-agent"),
        metadata: provisional ? { mustChangePassword: true } : undefined
      })
      .catch((err) => console.warn("[user-access] falha ao registrar login", err));

    if (provisional) {
      void prisma.auditLog
        .create({
          data: {
            entity: "User",
            entityId: user.id,
            action: "LOGIN_PROVISIONAL",
            userId: user.id,
            newData: { pathLabel: "Login com senha provisória" }
          }
        })
        .catch((err) => console.warn("[audit] falha ao registrar login provisório", err));
    }

    const redirectTo = provisional
      ? "/trocar-senha"
      : user.userKind === "EXTERNAL"
        ? "/externo/notificacoes"
        : null;
    const res = NextResponse.json({ ok: true, expires_in, user, redirectTo, access_token });
    res.cookies.set(GTI_TOKEN_COOKIE, access_token, {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
      httpOnly: false,
      secure: cookieSecure(req)
    });
    return res;
  } catch (e) {
    if (e instanceof Error && e.message === "CREDENTIALS") {
      return new NextResponse("Credenciais inválidas", { status: 401 });
    }
    if (e instanceof Error && e.message === "PENDING_APPROVAL") {
      return new NextResponse("Seu cadastro ainda está aguardando aprovação.", { status: 403 });
    }
    if (e instanceof Error && e.message === "REJECTED_APPROVAL") {
      return new NextResponse("Seu cadastro não foi aprovado. Entre em contato com a administração.", { status: 403 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`Erro ao entrar: ${msg}`, { status: 500 });
  }
}
