import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { glpiPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.glpiPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

/** Evita múltiplas instâncias do Prisma no mesmo processo (dev com HMR e produção no Next). */
globalForPrisma.glpiPrisma = prisma;
