import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/password-reset";

export async function POST(req: Request): Promise<NextResponse> {
  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  if (!email.trim()) {
    return NextResponse.json({ error: "Informe o e-mail cadastrado" }, { status: 400 });
  }

  await requestPasswordReset(email);
  return NextResponse.json({
    ok: true,
    message: "Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha."
  });
}
