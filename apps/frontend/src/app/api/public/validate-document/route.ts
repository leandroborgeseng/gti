import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/glpi/config/prisma";

function maskCpfBr(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, "");
  if (digits.length < 4) return "···.···.***-**";
  return `···.···.${digits.slice(-5, -2)}-${digits.slice(-2)}`;
}

/** Validação pública de documento (ticket 101) — sem autenticação. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const documentNumber = (url.searchParams.get("documentNumber") ?? "").trim();
  const verifierCode = (url.searchParams.get("verifierCode") ?? "").trim().toLowerCase();
  const validationCode = (url.searchParams.get("validationCode") ?? "").trim();

  if (!verifierCode) {
    return NextResponse.json(
      { ok: false, message: "Informe o código verificador." },
      { status: 400 }
    );
  }

  const signer = await prisma.contractNotificationSigner.findFirst({
    where: {
      verificationCode: { equals: verifierCode, mode: "insensitive" },
      signedAt: { not: null },
      ...(documentNumber
        ? { notification: { number: { equals: documentNumber, mode: "insensitive" } } }
        : {})
    },
    include: {
      notification: {
        include: {
          signers: { orderBy: { order: "asc" } },
          contract: { include: { organization: true } }
        }
      }
    }
  });

  if (!signer?.notification) {
    return NextResponse.json(
      { ok: false, message: "Documento não encontrado para os códigos informados." },
      { status: 404 }
    );
  }

  // Código de validação complementar: hash simples document+verificador (não é o único fator).
  if (validationCode) {
    const expected = simpleValidationCode(signer.notification.number, signer.verificationCode ?? "");
    if (validationCode.replace(/\s/g, "").toUpperCase() !== expected) {
      return NextResponse.json(
        { ok: false, message: "Código de validação não confere." },
        { status: 400 }
      );
    }
  }

  const n = signer.notification;
  const org = n.contract.organization;
  return NextResponse.json({
    ok: true,
    document: {
      number: n.number,
      subject: n.subject,
      status: n.status,
      signedAt: signer.signedAt,
      organizationLabel: org
        ? org.acronym
          ? `${org.acronym} · ${org.name}`
          : org.name
        : null,
      signers: n.signers
        .filter((s) => s.signedAt)
        .map((s) => ({
          name: s.signerName,
          jobTitle: s.signerJobTitle,
          orgLabel: s.signerOrgLabel,
          signedAt: s.signedAt,
          cpfMasked: maskCpfBr(s.signerCpf),
          verificationCode: s.verificationCode
        }))
    }
  });
}

function simpleValidationCode(documentNumber: string, verifier: string): string {
  const raw = `${documentNumber}|${verifier}`.toUpperCase();
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase().padStart(8, "0").slice(0, 8);
}
