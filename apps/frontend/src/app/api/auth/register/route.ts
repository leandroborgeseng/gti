import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/glpi/config/prisma";
import { isValidCpf, onlyDigitsCpf } from "@/modules/users/user-schemas";

type RegisterBody = {
  fullName?: unknown;
  cpf?: unknown;
  email?: unknown;
  userKind?: unknown;
  organizationId?: unknown;
  supplierId?: unknown;
  externalFunction?: unknown;
};

const EXTERNAL_FUNCTIONS = new Set([
  "REPRESENTANTE_LEGAL",
  "RESPONSAVEL_CONTRATUAL",
  "RESPONSAVEL_TECNICO",
  "USUARIO_AUXILIAR"
]);

function splitName(fullName: string): { firstName: string; lastName: string; displayName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? fullName.trim();
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
  return { firstName, lastName, displayName: fullName.trim() };
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido" }, { status: 400 });
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const cpf = typeof body.cpf === "string" ? onlyDigitsCpf(body.cpf) : "";
  const userKind = body.userKind === "EXTERNAL" ? "EXTERNAL" : body.userKind === "INTERNAL" ? "INTERNAL" : "";
  const organizationId =
    typeof body.organizationId === "string" && body.organizationId.trim()
      ? body.organizationId.trim()
      : null;
  const supplierId =
    typeof body.supplierId === "string" && body.supplierId.trim() ? body.supplierId.trim() : null;
  const externalFunction =
    typeof body.externalFunction === "string" && EXTERNAL_FUNCTIONS.has(body.externalFunction)
      ? body.externalFunction
      : null;

  if (!fullName || fullName.length < 3) {
    return NextResponse.json({ error: "Informe o nome completo." }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }
  if (!isValidCpf(cpf)) {
    return NextResponse.json({ error: "CPF inválido." }, { status: 400 });
  }
  if (!userKind) {
    return NextResponse.json({ error: "Selecione o tipo de usuário." }, { status: 400 });
  }

  if (userKind === "INTERNAL") {
    if (!organizationId) {
      return NextResponse.json({ error: "Selecione o órgão." }, { status: 400 });
    }
    const org = await prisma.organization.findFirst({
      where: { id: organizationId, active: true },
      select: { id: true }
    });
    if (!org) {
      return NextResponse.json({ error: "Órgão inválido ou inativo." }, { status: 400 });
    }
  } else {
    if (!supplierId) {
      return NextResponse.json({ error: "Selecione a empresa representada." }, { status: 400 });
    }
    if (!externalFunction) {
      return NextResponse.json({ error: "Informe a função ou vínculo com a empresa." }, { status: 400 });
    }
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId },
      select: { id: true }
    });
    if (!supplier) {
      return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
    }
  }

  const emailExists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (emailExists) {
    return NextResponse.json(
      { error: "Já existe uma conta ou solicitação com este e-mail." },
      { status: 409 }
    );
  }
  const cpfExists = await prisma.user.findFirst({ where: { cpf }, select: { id: true } });
  if (cpfExists) {
    return NextResponse.json(
      { error: "Já existe uma conta ou solicitação com este CPF." },
      { status: 409 }
    );
  }

  const viewerProfile = await prisma.accessProfile.findUnique({ where: { systemKey: "VIEWER" } });
  const externalProfile = await prisma.accessProfile.findUnique({ where: { systemKey: "EXTERNAL" } });
  const profile =
    userKind === "EXTERNAL" ? externalProfile ?? viewerProfile : viewerProfile;
  if (!profile) {
    return NextResponse.json(
      { error: "Perfis de acesso ainda não foram inicializados. Contate a administração." },
      { status: 503 }
    );
  }

  const { firstName, lastName, displayName } = splitName(fullName);
  // Senha provisória aleatória — o administrador define/envia a senha na aprovação
  // ou o usuário usa «Esqueci minha senha» após aprovado.
  const tempPassword = randomBytes(24).toString("base64url");
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const created = await prisma.user.create({
    data: {
      email,
      cpf,
      firstName,
      lastName,
      displayName,
      passwordHash,
      mustChangePassword: true,
      approvalStatus: "PENDING",
      userKind,
      role: userKind === "EXTERNAL" ? "VIEWER" : "VIEWER",
      organizationId: userKind === "INTERNAL" ? organizationId : null,
      supplierId: userKind === "EXTERNAL" ? supplierId : null,
      externalFunction: userKind === "EXTERNAL" ? (externalFunction as never) : null,
      allOrganizations: false,
      defaultProfileId: profile.id,
      lastActiveProfileId: profile.id,
      defaultOrganizationId: userKind === "INTERNAL" ? organizationId : null,
      lastActiveOrganizationId: userKind === "INTERNAL" ? organizationId : null,
      accessProfiles: {
        create: { profileId: profile.id, isDefault: true }
      },
      ...(userKind === "INTERNAL" && organizationId
        ? { organizations: { create: { organizationId } } }
        : {})
    },
    select: { id: true, email: true, userKind: true }
  });

  await prisma.auditLog.create({
    data: {
      entity: "User",
      entityId: created.id,
      action: "ACCESS_REQUEST",
      userId: "system",
      oldData: Prisma.JsonNull,
      newData: {
        email: created.email,
        userKind: created.userKind,
        approvalStatus: "PENDING",
        organizationId: userKind === "INTERNAL" ? organizationId : null,
        supplierId: userKind === "EXTERNAL" ? supplierId : null,
        externalFunction: userKind === "EXTERNAL" ? externalFunction : null
      }
    }
  });

  return NextResponse.json({
    ok: true,
    message:
      "Solicitação enviada. Aguarde a aprovação da administração. Após aprovado, use «Esqueci minha senha» ou a senha provisória informada pelo administrador para o primeiro acesso."
  });
}
