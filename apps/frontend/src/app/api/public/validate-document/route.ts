import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/glpi/config/prisma";
import {
  deriveDocumentValidationCode
} from "@/lib/document-codes";

function maskCpfBr(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, "");
  if (digits.length < 4) return "···.···.***-**";
  return `···.···.${digits.slice(-5, -2)}-${digits.slice(-2)}`;
}

function buildPayload(n: {
  number: string;
  subject: string;
  status: string;
  contract: { organization: { acronym: string | null; name: string } | null };
  signers: Array<{
    signedAt: Date | null;
    signerName: string | null;
    signerJobTitle: string | null;
    signerOrgLabel: string | null;
    signerCpf: string | null;
    verificationCode: string | null;
  }>;
}, signedAt: Date | null) {
  const org = n.contract.organization;
  return {
    ok: true as const,
    document: {
      number: n.number,
      subject: n.subject,
      status: n.status,
      signedAt,
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
  };
}

/** Validação pública de documento (ticket 101) — sem autenticação. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const documentNumber = (url.searchParams.get("documentNumber") ?? "").trim();
  const verifierCode = (url.searchParams.get("verifierCode") ?? "").trim();
  const validationCode = (url.searchParams.get("validationCode") ?? "").trim();

  if (!verifierCode) {
    return NextResponse.json(
      { ok: false, message: "Informe o código verificador." },
      { status: 400 }
    );
  }

  // 1) Preferência: código verificador do documento (nível DOC-SIGTI / NOT-SIGTI).
  const byDocument = await prisma.contractNotification.findFirst({
    where: {
      documentVerifierCode: { equals: verifierCode, mode: "insensitive" },
      ...(documentNumber
        ? { number: { equals: documentNumber, mode: "insensitive" } }
        : {})
    },
    include: {
      signers: { orderBy: { order: "asc" } },
      contract: { include: { organization: true } }
    }
  });

  if (byDocument) {
    if (validationCode) {
      const expected =
        byDocument.documentValidationCode ||
        deriveDocumentValidationCode(byDocument.number, byDocument.documentVerifierCode ?? verifierCode);
      if (validationCode.replace(/\s/g, "").toUpperCase() !== expected.toUpperCase()) {
        return NextResponse.json(
          { ok: false, message: "Código de validação não confere." },
          { status: 400 }
        );
      }
    }
    const lastSigned =
      byDocument.signers
        .filter((s) => s.signedAt)
        .map((s) => s.signedAt!)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return NextResponse.json(buildPayload(byDocument, lastSigned));
  }

  // 2) Compatibilidade: código verificador de uma assinatura (documentos antigos).
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

  if (validationCode) {
    const n = signer.notification;
    const expected =
      n.documentValidationCode ||
      deriveDocumentValidationCode(n.number, n.documentVerifierCode || signer.verificationCode || "");
    if (validationCode.replace(/\s/g, "").toUpperCase() !== expected.toUpperCase()) {
      return NextResponse.json(
        { ok: false, message: "Código de validação não confere." },
        { status: 400 }
      );
    }
  }

  return NextResponse.json(buildPayload(signer.notification, signer.signedAt));
}
