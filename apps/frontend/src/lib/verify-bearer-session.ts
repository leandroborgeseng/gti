import { jwtVerify } from "jose";
import { jwtSecretBytes } from "@/lib/jwt-config";

export type SessionPayload = { sub: string; email: string; role: string };

/** Valida JWT HS256 emitido por este Next ou pelo Nest (mesmo segredo). */
export async function verifyBearerToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, jwtSecretBytes(), { algorithms: ["HS256"] });
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  const role = typeof payload.role === "string" ? payload.role : "";
  if (!sub || !email) {
    throw new Error("INVALID_SESSION");
  }
  return { sub, email, role };
}
