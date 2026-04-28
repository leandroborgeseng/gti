import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { loginWithDatabase } from "@/lib/auth-issue-token";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import { ensureBootstrapAdminIfNoUsers } from "@/lib/ensure-bootstrap-admin";
import { gestaoUserAccess } from "@/server/gestao/gestao-services";

function requestIp(req: Request): string | null {
  const raw = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  return raw?.split(",")[0]?.trim() || null;
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
    void gestaoUserAccess
      .record({
        actor: { userId: user.id, email: user.email, role: user.role as UserRole },
        eventType: "LOGIN",
        path: "/login",
        pathLabel: "Login",
        ipAddress: requestIp(req),
        userAgent: req.headers.get("user-agent")
      })
      .catch((err) => console.warn("[user-access] falha ao registrar login", err));
    const redirectTo = user.mustChangePassword ? "/trocar-senha" : null;
    const res = NextResponse.json({ ok: true, expires_in, user, redirectTo });
    res.cookies.set(GTI_TOKEN_COOKIE, access_token, {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production"
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
