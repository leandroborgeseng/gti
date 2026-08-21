import { createHash, randomBytes } from "node:crypto";

/** Gera código verificador curto (8–12 chars), sem O/0/I/1. */
export function generateDocumentVerifierCode(length = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

/** Código de validação complementar (não é o único fator de segurança). */
export function deriveDocumentValidationCode(documentNumber: string, verifierCode: string): string {
  const raw = `${documentNumber.trim().toUpperCase()}|${verifierCode.trim().toUpperCase()}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 8).toUpperCase();
}

/** Prefixo dos novos documentos; notificações antigas NOT-SIGTI são preservadas. */
export function formatDocumentNumber(seq: number, year: number): string {
  return `DOC-SIGTI-${String(seq).padStart(4, "0")}/${year}`;
}
