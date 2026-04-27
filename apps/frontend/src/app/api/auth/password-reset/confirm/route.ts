import { NextResponse } from "next/server";
import { resetPasswordWithToken } from "@/lib/password-reset";

export async function POST(req: Request): Promise<NextResponse> {
  let body: { token?: string; password?: string };
  try {
    body = (await req.json()) as { token?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token || password.length < 8) {
    return NextResponse.json({ error: "Token inválido ou senha com menos de 8 caracteres" }, { status: 400 });
  }

  try {
    await resetPasswordWithToken(token, password);
    return NextResponse.json({ ok: true, message: "Senha redefinida com sucesso." });
  } catch (e) {
    if (e instanceof Error && e.message === "TOKEN_INVALIDO") {
      return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Erro ao redefinir senha";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
