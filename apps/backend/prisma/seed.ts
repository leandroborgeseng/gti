import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@local.dev").trim().toLowerCase();
  const plain = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "admin123";
  const hash = await bcrypt.hash(plain, 10);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        role: UserRole.ADMIN
      }
    });
    console.log(`Utilizador administrador criado: ${email}`);
  } else {
    console.log(`Utilizador já existe (não alterado): ${email}`);
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
