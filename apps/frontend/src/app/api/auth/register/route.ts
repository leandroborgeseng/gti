import * as bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { prisma } from "@/glpi/config/prisma";

type RegisterBody = {
  email?: unknown;
  password?: unknown;
};

export async function POST(req: Request): Promise<NextResponse> {
  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "A senha deve ter pelo menos 8 caracteres." }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: "Já existe uma conta com este e-mail." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: "VIEWER",
      mustChangePassword: false,
      approvalStatus: "PENDING"
    },
    select: { id: true }
  });

  return NextResponse.json({
    ok: true,
    message: "Cadastro enviado. Aguarde a aprovação da administração para entrar no sistema."
  });
}
