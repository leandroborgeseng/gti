import * as bcrypt from "bcrypt";
import { prisma } from "@/glpi/config/prisma";

function isUniqueConstraintError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";
}

/**
 * Se não existir nenhum usuário (ex.: deploy sem `prisma db seed`), cria o mesmo
 * administrador que `apps/backend/prisma/seed.ts`, para o primeiro login funcionar.
 */
export async function ensureBootstrapAdminIfNoUsers(): Promise<void> {
  if ((await prisma.user.count()) > 0) {
    return;
  }
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@local.dev").trim().toLowerCase();
  const plain = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "admin123";
  const passwordHash = await bcrypt.hash(plain, 10);
  try {
    const adminProfile = await prisma.accessProfile.findUnique({ where: { systemKey: "ADMIN" } });
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        mustChangePassword: true,
        role: "ADMIN",
        allOrganizations: true,
        ...(adminProfile
          ? {
              defaultProfileId: adminProfile.id,
              lastActiveProfileId: adminProfile.id,
              accessProfiles: { create: { profileId: adminProfile.id, isDefault: true } }
            }
          : {})
      }
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return;
    }
    throw e;
  }
}
