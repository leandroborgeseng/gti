import * as bcrypt from "bcrypt";
import { SignJWT } from "jose";
import { buildActiveContext, loadUserAccessContext } from "@gestao/common/access-context";
import { prisma } from "@/glpi/config/prisma";
import { jwtExpiresIn, jwtSecretBytes } from "@/lib/jwt-config";

export type LoginSuccess = {
  access_token: string;
  expires_in: string;
  user: {
    id: string;
    email: string;
    role: string;
    mustChangePassword: boolean;
    userKind?: "INTERNAL" | "EXTERNAL";
  };
};

export async function issueAuthToken(user: {
  id: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
}): Promise<{ access_token: string; expires_in: string }> {
  const exp = jwtExpiresIn();
  const access_token = await new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(exp)
    .sign(jwtSecretBytes());

  return { access_token, expires_in: exp };
}

/**
 * Autenticação local (PostgreSQL + bcrypt + JWT), sem serviço Nest.
 * O token é compatível com o `JwtStrategy` do backend (HS256, mesmo segredo por padrão).
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
  if (user.approvalStatus === "PENDING") {
    throw new Error("PENDING_APPROVAL");
  }
  if (user.approvalStatus === "REJECTED") {
    throw new Error("REJECTED_APPROVAL");
  }

  let role = user.role;
  try {
    const access = await loadUserAccessContext(prisma, user.id);
    if (access) {
      const ctx = buildActiveContext(access);
      role = ctx.role;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastActiveProfileId: ctx.profileId,
          lastActiveOrganizationId: ctx.organizationId,
          ...(ctx.systemKey === "ADMIN" || ctx.systemKey === "EDITOR" || ctx.systemKey === "VIEWER"
            ? { role: ctx.systemKey }
            : {})
        }
      });
    }
  } catch {
    /* mantém role legado */
  }

  const { access_token, expires_in } = await issueAuthToken({
    id: user.id,
    email: user.email,
    role,
    mustChangePassword: user.mustChangePassword
  });

  return {
    access_token,
    expires_in,
    user: {
      id: user.id,
      email: user.email,
      role,
      mustChangePassword: user.mustChangePassword,
      userKind: user.userKind ?? "INTERNAL"
    }
  };
}
