import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/glpi/config/prisma";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import { verifyBearerToken, type SessionPayload } from "@/lib/verify-bearer-session";

const JSON_UTF8 = { "content-type": "application/json; charset=utf-8" } as const;

export function jsonBackupError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: JSON_UTF8 });
}

/**
 * Exige administrador autenticado (Bearer ou cookie de sessão).
 */
export async function requireBackupAdmin(
  req: Request
): Promise<{ ok: true; session: SessionPayload } | { ok: false; response: NextResponse }> {
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const token = bearer || cookies().get(GTI_TOKEN_COOKIE)?.value || "";

  if (!token) {
    return { ok: false, response: jsonBackupError(401, "Não autenticado.") };
  }

  let session: SessionPayload;
  try {
    session = await verifyBearerToken(token);
  } catch {
    return { ok: false, response: jsonBackupError(401, "Sessão inválida.") };
  }

  if (session.mustChangePassword) {
    return {
      ok: false,
      response: jsonBackupError(403, "Altere a sua senha antes de continuar.")
    };
  }

  if (session.role !== "ADMIN") {
    return {
      ok: false,
      response: jsonBackupError(403, "Apenas administradores podem gerir backups do sistema.")
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, role: true }
  });
  if (!user || user.email !== session.email || user.role !== "ADMIN") {
    return { ok: false, response: jsonBackupError(401, "Sessão inválida.") };
  }

  return { ok: true, session };
}
