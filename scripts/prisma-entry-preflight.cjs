/**
 * Corre antes de `prisma migrate deploy` no contentor.
 *
 * - PRISMA_FRESH_PUBLIC_SCHEMA_ON_BOOT: sempre faz DROP/CREATE do schema public.
 * - Caso contrário: se a BD tiver nomes de migração em _prisma_migrations que já não
 *   existem como pastas em prisma/migrations, migrate deploy nunca passa (P3009 ou P3015).
 *   Com PRISMA_AUTO_WIPE_ON_LEGACY_DRIFT=1, apaga o schema public uma vez e segue.
 *   Sem essa variável, termina com exit 1 e mensagem a pedir uma das duas.
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
  await prisma.$executeRawUnsafe(
    "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;"
  );
  console.warn("[prisma-preflight] Schema public reiniciado (DROP CASCADE + CREATE).");
}

async function main() {
  const prisma = new PrismaClient();

  if (process.env.PRISMA_FRESH_PUBLIC_SCHEMA_ON_BOOT) {
    console.warn("[prisma-preflight] PRISMA_FRESH_PUBLIC_SCHEMA_ON_BOOT definido → reinício total da BD.");
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

  const autoWipe = process.env.PRISMA_AUTO_WIPE_ON_LEGACY_DRIFT === "1";

  if (orphanInDb.length > 0) {
    const names = orphanInDb.map((r) => r.migration_name).join(", ");
    if (autoWipe) {
      console.warn(
        `[prisma-preflight] Migrações na BD sem ficheiro local (${names}). PRISMA_AUTO_WIPE_ON_LEGACY_DRIFT=1 → reinício do schema public.`
      );
      await wipePublic(prisma);
      await prisma.$disconnect();
      return;
    }
    console.error(
      `[prisma-preflight] A base referencia migrações que já não estão no repositório: ${names}.\n` +
        "Corrige de uma destas formas (Railway → Variables, um deploy, depois remove a variável):\n" +
        "  • PRISMA_FRESH_PUBLIC_SCHEMA_ON_BOOT=1  (reinício total)\n" +
        "  • PRISMA_AUTO_WIPE_ON_LEGACY_DRIFT=1   (só apaga se houver nomes órfãos, como acima)"
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  if (failedInRepo.length > 0) {
    const n = failedInRepo[0].migration_name;
    console.error(
      `[prisma-preflight] Migração falhada ainda registada na BD: ${n} (finished_at nulo).\n` +
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
