/**
 * Worker opcional de sincronização GLPI (sem servidor HTTP).
 * Mesma lógica que o arranque do Next (`instrumentation.ts`), sem guard de HMR.
 *
 * Executar na raiz do repositório: `npm run start:worker`
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
loadEnv({ path: path.join(repoRoot, ".env") });
loadEnv({ path: path.join(repoRoot, "apps", "frontend", ".env.local") });

function toErrorLog(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

async function main(): Promise<void> {
  /** Separa checkpoints em `SyncState` dos do servidor Next (evita colisão na mesma BD). */
  process.env.GLPI_WORKER_PROCESS = "1";
  const { logger } = await import("../src/glpi/config/logger");
  const { bootstrapGlpiWorkerProcess } = await import("../src/glpi/sync-cron");
  try {
    await bootstrapGlpiWorkerProcess();
  } catch (error) {
    logger.error({ error: toErrorLog(error) }, "Erro fatal na inicialização do worker GLPI");
    process.exit(1);
  }
}

void main();
