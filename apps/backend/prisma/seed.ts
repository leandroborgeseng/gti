import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@local.dev").trim().toLowerCase();
  const plain = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "admin123";
  const hash = await bcrypt.hash(plain, 10);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const adminProfile = await prisma.accessProfile.findUnique({ where: { systemKey: "ADMIN" } });
    await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        role: UserRole.ADMIN,
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
    console.log(`Usuário administrador criado: ${email}`);
  } else {
    console.log(`Usuário já existe (não alterado): ${email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
