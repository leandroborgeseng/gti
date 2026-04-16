import cron from "node-cron";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { syncTickets, type SyncProgress, type SyncTicketsResult } from "./jobs/sync-tickets.job";
import { ensureSqliteSchema } from "./scripts/bootstrap-db";
import { loadOpenApiSpec } from "./services/openapi.loader";
import { getAccessToken } from "./services/auth.service";
import { enrichWaitingPartyBatch } from "./services/glpi-ticket-history.service";
import { AxiosError } from "axios";

function toErrorLog(error: unknown): { message: string; stack?: string } {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const url = error.config?.url;
    const method = error.config?.method;
    const responseText =
      typeof error.response?.data === "string"
        ? error.response.data
        : error.response?.data
          ? JSON.stringify(error.response.data)
          : "";
    return {
      message: `[HTTP] ${method || "?"} ${url || "?"} -> ${status || "sem_status"} ${responseText}`.trim(),
      stack: error.stack
    };
  }
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

let isSyncRunning = false;

export const syncStatus = {
  isRunning: false,
  runs: 0,
  lastStartedAt: null as string | null,
  lastFinishedAt: null as string | null,
  lastSuccessAt: null as string | null,
  lastError: null as string | null,
  lastLoaded: 0,
  lastSaved: 0,
  lastFailed: 0,
  lastPage: 0
};

function applySyncProgress(progress: SyncProgress): void {
  syncStatus.lastPage = progress.page;
  syncStatus.lastLoaded = progress.loaded;
  syncStatus.lastSaved = progress.saved;
  syncStatus.lastFailed = progress.failed;
}

export async function runSyncWithGuard(): Promise<void> {
  if (isSyncRunning) {
    logger.warn("Sincronização anterior ainda em andamento, pulando execução");
    return;
  }

  isSyncRunning = true;
  syncStatus.isRunning = true;
  syncStatus.runs += 1;
  syncStatus.lastStartedAt = new Date().toISOString();
  syncStatus.lastPage = 0;
  syncStatus.lastLoaded = 0;
  syncStatus.lastSaved = 0;
  syncStatus.lastFailed = 0;
  try {
    await loadOpenApiSpec().catch((error) => {
      logger.warn({ error: toErrorLog(error) }, "Falha ao atualizar doc OpenAPI, usando endpoint padrão");
    });
    const result: SyncTicketsResult = await syncTickets({
      onProgress: applySyncProgress
    });
    applySyncProgress({ page: syncStatus.lastPage || 1, ...result });
    await enrichWaitingPartyBatch(35).catch((error) => {
      logger.warn({ error: toErrorLog(error) }, "Enriquecimento waitingParty ignorado");
    });
    syncStatus.lastSuccessAt = new Date().toISOString();
    syncStatus.lastError = null;
  } catch (error) {
    const details = toErrorLog(error);
    syncStatus.lastError = details.message;
    logger.error({ error: details }, `Falha na sincronização de tickets: ${details.message}`);
  } finally {
    isSyncRunning = false;
    syncStatus.isRunning = false;
    syncStatus.lastFinishedAt = new Date().toISOString();
  }
}

export function startGlpiSyncCron(): void {
  cron.schedule(env.CRON_EXPRESSION, () => {
    void runSyncWithGuard();
  });
  logger.info({ cron: env.CRON_EXPRESSION }, "Cron de sincronização GLPI iniciado (worker Node)");
}

/** Processo dedicado: apenas sincronização (sem HTTP). A UI fica em apps/frontend. */
export async function bootstrapGlpiWorker(): Promise<void> {
  await ensureSqliteSchema();
  await loadOpenApiSpec().catch((error) => {
    logger.warn({ error: toErrorLog(error) }, "Falha no carregamento inicial do doc OpenAPI");
  });
  await getAccessToken().catch((error) => {
    logger.warn({ error: toErrorLog(error) }, "Falha na autenticação inicial; o cron fará novas tentativas");
  });
  await runSyncWithGuard();
  startGlpiSyncCron();
}
