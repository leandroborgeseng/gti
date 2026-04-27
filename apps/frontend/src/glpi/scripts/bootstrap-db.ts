import { prisma } from "../config/prisma";
import { logger } from "../config/logger";

/**
 * Confirma link para o PostgreSQL. O esquema (incl. tabelas GLPI) é aplicado com
 * `npm run prisma:migrate` / `prisma migrate deploy` em `apps/backend`.
 */
export async function ensureSqliteSchema(): Promise<void> {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  logger.info("Ligação à banco de dados verificada (PostgreSQL + Prisma Migrate).");
}
