import * as bcrypt from "bcrypt";
import { SignJWT } from "jose";
import { prisma } from "@/glpi/config/prisma";
import { jwtExpiresIn, jwtSecretBytes } from "@/lib/jwt-config";

export type LoginSuccess = {
  access_token: string;
  expires_in: string;
  user: { email: string; role: string };
};

/**
 * Autenticação local (PostgreSQL + bcrypt + JWT), sem serviço Nest.
 * O token é compatível com o `JwtStrategy` do backend (HS256, mesmo segredo por omissão).
 */
export async function loginWithDatabase(email: string, password: string): Promise<LoginSuccess> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    throw new Error("CREDENTIALS");
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new Error("CREDENTIALS");
  }
  const exp = jwtExpiresIn();
  const access_token = await new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(exp)
    .sign(jwtSecretBytes());

  return {
    access_token,
    expires_in: exp,
    user: { email: user.email, role: user.role }
  };
}
