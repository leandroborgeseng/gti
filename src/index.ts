/**
 * Worker opcional: sincronização GLPI + PostgreSQL (cron).
 * A interface (Kanban e APIs HTTP) vive em `apps/frontend` com Next.js.
 */
import { logger } from "./config/logger";
import { bootstrapGlpiWorker } from "./sync-cron";

function toErrorLog(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

bootstrapGlpiWorker().catch((error) => {
  logger.error({ error: toErrorLog(error) }, "Erro fatal na inicialização do worker GLPI");
  process.exit(1);
});
