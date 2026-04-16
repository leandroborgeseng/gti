import cron from "node-cron";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { syncTickets, type SyncProgress, type SyncTicketsResult } from "./jobs/sync-tickets.job";
import { ensureSqliteSchema } from "./scripts/bootstrap-db";
import { loadOpenApiSpec } from "./services/openapi.loader";
import { getAccessToken } from "./services/auth.service";
import { enrichWaitingPartyBatch } from "./services/glpi-ticket-history.service";
import { toErrorLog } from "./errors";

let isSyncRunning = false;

/** Opções do arranque da sincronização (processo Next vs worker CLI). */
export type BootstrapGlpiSyncOptions = {
  /**
   * Quando `true` (padrão no Next), evita segundo cron em HMR.
   * No worker dedicado, use `false`.
   */
  enableHmrGuard?: boolean;
};

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
  const startedMs = Date.now();
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
    logger.info(
      {
        durationMs: Date.now() - startedMs,
        loaded: result.loaded,
        saved: result.saved,
        failed: result.failed
      },
      "Sincronização GLPI concluída"
    );
  } catch (error) {
    const details = toErrorLog(error);
    syncStatus.lastError = details.message;
    logger.error(
      { error: details, durationMs: Date.now() - startedMs },
      `Falha na sincronização de tickets: ${details.message}`
    );
  } finally {
    isSyncRunning = false;
    syncStatus.isRunning = false;
    syncStatus.lastFinishedAt = new Date().toISOString();
  }
}

export function startGlpiSyncCron(): void {
  if (process.env.GLPI_CRON_DISABLED === "1") {
    logger.info("Cron GLPI desativado (GLPI_CRON_DISABLED=1)");
    return;
  }
  try {
    cron.schedule(env.CRON_EXPRESSION, () => {
      void runSyncWithGuard();
    });
    logger.info({ cron: env.CRON_EXPRESSION }, "Cron de sincronização GLPI iniciado");
  } catch (error) {
    logger.error(
      { error: toErrorLog(error), cron: env.CRON_EXPRESSION },
      "Expressão de cron inválida ou falha ao agendar; a app continua sem agendamento"
    );
  }
}

const globalCron = globalThis as { __glpiNextCronStarted?: boolean };

/**
 * Arranque da sincronização GLPI (schema auxiliar, token, primeira sync, cron).
 * Partilhado pelo Next (`instrumentation`) e pelo worker CLI na raiz do monorepo.
 */
export async function bootstrapGlpiSync(options: BootstrapGlpiSyncOptions = {}): Promise<void> {
  const enableHmrGuard = options.enableHmrGuard ?? true;
  if (enableHmrGuard && globalCron.__glpiNextCronStarted) {
    return;
  }

  await ensureSqliteSchema();
  await loadOpenApiSpec().catch((error) => {
    logger.warn({ error: toErrorLog(error) }, "Falha no carregamento inicial do doc OpenAPI");
  });
  await getAccessToken().catch((error) => {
    logger.warn({ error: toErrorLog(error) }, "Falha na autenticação inicial; o cron fará novas tentativas");
  });

  await runSyncWithGuard();
  startGlpiSyncCron();
  if (enableHmrGuard) {
    globalCron.__glpiNextCronStarted = true;
  }
}

/** Next.js: evita duplicar o cron em HMR. */
export async function bootstrapGlpiSyncInNext(): Promise<void> {
  await bootstrapGlpiSync({ enableHmrGuard: true });
}

/** Processo dedicado (CLI `tsx apps/frontend/scripts/glpi-worker-cli.ts`): mesma lógica, sem guard de HMR. */
export async function bootstrapGlpiWorkerProcess(): Promise<void> {
  await bootstrapGlpiSync({ enableHmrGuard: false });
}
