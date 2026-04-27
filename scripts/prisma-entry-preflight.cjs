/**
 * Corre antes de `prisma migrate deploy` no contêiner.
 *
 * - PRISMA_FRESH_PUBLIC_SCHEMA_ON_BOOT: sempre faz DROP/CREATE do schema public.
 * - Se _prisma_migrations tiver nomes que já não existem em prisma/migrations (histórico
 *   órfão), por padrão faz o mesmo reset do schema public — migrate deploy nunca passaria
 *   sem isso (P3009 / P3015). Para falhar em vez de apagar: PRISMA_NO_AUTO_WIPE_ON_LEGACY_DRIFT=1.
 * - PRISMA_AUTO_WIPE_ON_LEGACY_DRIFT=1 continua válido (explícito); o efeito é o mesmo do
 *   comportamento por padrão quando há órfãos.
 */

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const SCHEMA_REL = path.join(__dirname, "..", "apps", "backend", "prisma", "migrations");

function localMigrationNames() {
  if (!fs.existsSync(SCHEMA_REL)) {
    console.error(`[prisma-preflight] Pasta não encontrada: ${SCHEMA_REL}`);
    process.exit(1);
  }
  return fs
    .readdirSync(SCHEMA_REL, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

async function wipePublic(prisma) {
  // Um comando por chamada: o Postgres via prepared statement não aceita várias instruções.
  await prisma.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await prisma.$executeRawUnsafe("CREATE SCHEMA public");
  await prisma.$executeRawUnsafe("GRANT ALL ON SCHEMA public TO PUBLIC");
  console.warn("[prisma-preflight] Schema public reiniciado (DROP CASCADE + CREATE).");
}

async function main() {
  const prisma = new PrismaClient();

  if (process.env.PRISMA_FRESH_PUBLIC_SCHEMA_ON_BOOT) {
    console.warn("[prisma-preflight] PRISMA_FRESH_PUBLIC_SCHEMA_ON_BOOT definido → reinício total da banco de dados.");
    await wipePublic(prisma);
    await prisma.$disconnect();
    return;
  }

  const locals = new Set(localMigrationNames());
  let rows = [];
  try {
    rows = await prisma.$queryRaw`
      SELECT "migration_name", "finished_at"
      FROM "_prisma_migrations"
    `;
  } catch {
    await prisma.$disconnect();
    return;
  }

  const orphanInDb = rows.filter((r) => !locals.has(r.migration_name));
  const failedInRepo = rows.filter(
    (r) => r.finished_at == null && locals.has(r.migration_name)
  );

  const noAutoWipe = process.env.PRISMA_NO_AUTO_WIPE_ON_LEGACY_DRIFT === "1";

  if (orphanInDb.length > 0) {
    const names = orphanInDb.map((r) => r.migration_name).join(", ");
    if (noAutoWipe) {
      console.error(
        `[prisma-preflight] Migrações órfãs no banco de dados (${names}). migrate deploy não pode continuar.\n` +
          "Remove PRISMA_NO_AUTO_WIPE_ON_LEGACY_DRIFT ou define PRISMA_FRESH_PUBLIC_SCHEMA_ON_BOOT=1."
      );
      await prisma.$disconnect();
      process.exit(1);
    }
    console.warn(
      `[prisma-preflight] Migrações no banco de dados sem arquivo local (${names}) → reinício automático do schema public.`
    );
    await wipePublic(prisma);
    await prisma.$disconnect();
    return;
  }

  if (failedInRepo.length > 0) {
    const n = failedInRepo[0].migration_name;
    console.error(
      `[prisma-preflight] Migração falhada ainda registrada no banco de dados: ${n} (finished_at nulo).\n` +
        `Define PRISMA_RESOLVE_ROLLED_BACK=${n} ou PRISMA_RESOLVE_APPLIED=${n} conforme o estado real do DDL, ou PRISMA_FRESH_PUBLIC_SCHEMA_ON_BOOT=1 para recomeçar.`
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
