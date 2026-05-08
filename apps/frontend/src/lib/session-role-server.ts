import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import { jwtSecretBytes } from "@/lib/jwt-config";

/** Papel JWT no cookie de sessão (rotas servidor). */
export async function getJwtRoleFromCookies(): Promise<string | null> {
  const token = cookies().get(GTI_TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecretBytes());
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** Gestão contratual: envio/remoção de anexos (paridade com `assertMutation`). */
export async function gestaoMayMutateAttachments(): Promise<boolean> {
  const role = await getJwtRoleFromCookies();
  return role === "ADMIN" || role === "EDITOR";
}
