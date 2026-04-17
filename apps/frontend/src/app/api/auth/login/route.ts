import { NextResponse } from "next/server";
import { loginWithDatabase } from "@/lib/auth-issue-token";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import { ensureBootstrapAdminIfNoUsers } from "@/lib/ensure-bootstrap-admin";

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
    const res = NextResponse.json({ ok: true, expires_in, user });
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
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`Erro ao iniciar sessão: ${msg}`, { status: 500 });
  }
}
