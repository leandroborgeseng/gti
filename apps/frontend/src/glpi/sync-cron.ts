import cron from "node-cron";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { syncTickets, type SyncProgress, type SyncTicketsResult } from "./jobs/sync-tickets.job";
import { ensureSqliteSchema } from "./scripts/bootstrap-db";
import { loadOpenApiSpec } from "./services/openapi.loader";
import { getAccessToken } from "./services/auth.service";
import { enrichWaitingPartyBatch } from "./services/glpi-ticket-history.service";
import { toErrorLog } from "./errors";
import {
  persistGlpiSyncStatusSafe,
  recordGlpiBootstrapCheckpoint
} from "./glpi-sync-status-persistence";

/** Estado partilhado no `globalThis` — o Next pode instanciar `sync-cron` em mais do que um bundle (instrumentation vs rotas). */
type GlpiSyncStatus = {
  isRunning: boolean;
  runs: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastLoaded: number;
  lastSaved: number;
  lastFailed: number;
  lastPage: number;
};

type GlpiStore = {
  syncStatus: GlpiSyncStatus;
  isSyncRunning: boolean;
  nextCronStarted: boolean;
};

function getGlpiStore(): GlpiStore {
  const g = globalThis as { __glpiStore?: GlpiStore };
  if (!g.__glpiStore) {
    g.__glpiStore = {
      isSyncRunning: false,
      nextCronStarted: false,
      syncStatus: {
        isRunning: false,
        runs: 0,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastSuccessAt: null,
        lastError: null,
        lastLoaded: 0,
        lastSaved: 0,
        lastFailed: 0,
        lastPage: 0
      }
    };
  }
  return g.__glpiStore;
}

/** Opções do arranque da sincronização (processo Next vs worker CLI). */
export type BootstrapGlpiSyncOptions = {
  /**
   * Quando `true` (padrão no Next), evita segundo cron em HMR.
   * No worker dedicado, use `false`.
   */
  enableHmrGuard?: boolean;
};

export const syncStatus = getGlpiStore().syncStatus;

/** Evita escritas excessivas em `SyncState` durante `onProgress`. */
let lastProgressDbWriteMs = 0;

function applySyncProgress(progress: SyncProgress): void {
  const s = getGlpiStore().syncStatus;
  s.lastPage = progress.page;
  s.lastLoaded = progress.loaded;
  s.lastSaved = progress.saved;
  s.lastFailed = progress.failed;
  const now = Date.now();
  if (now - lastProgressDbWriteMs >= 5000) {
    lastProgressDbWriteMs = now;
    void persistGlpiSyncStatusSafe({ ...s });
  }
}

export async function runSyncWithGuard(): Promise<void> {
  const store = getGlpiStore();
  if (store.isSyncRunning) {
    logger.warn("Sincronização anterior ainda em andamento, pulando execução");
    return;
  }

  store.isSyncRunning = true;
  store.syncStatus.isRunning = true;
  store.syncStatus.runs += 1;
  store.syncStatus.lastStartedAt = new Date().toISOString();
  store.syncStatus.lastPage = 0;
  store.syncStatus.lastLoaded = 0;
  store.syncStatus.lastSaved = 0;
  store.syncStatus.lastFailed = 0;
  lastProgressDbWriteMs = 0;
  await persistGlpiSyncStatusSafe({ ...store.syncStatus });
  const startedMs = Date.now();
  try {
    await loadOpenApiSpec().catch((error) => {
      logger.warn({ error: toErrorLog(error) }, "Falha ao atualizar doc OpenAPI, usando endpoint padrão");
    });
    const result: SyncTicketsResult = await syncTickets({
      onProgress: applySyncProgress
    });
    applySyncProgress({ page: store.syncStatus.lastPage || 1, ...result });
    await enrichWaitingPartyBatch(35).catch((error) => {
      logger.warn({ error: toErrorLog(error) }, "Enriquecimento waitingParty ignorado");
    });
    store.syncStatus.lastSuccessAt = new Date().toISOString();
    store.syncStatus.lastError = null;
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
    store.syncStatus.lastError = details.message;
    logger.error(
      { error: details, durationMs: Date.now() - startedMs },
      `Falha na sincronização de tickets: ${details.message}`
    );
  } finally {
    store.isSyncRunning = false;
    store.syncStatus.isRunning = false;
    store.syncStatus.lastFinishedAt = new Date().toISOString();
    await persistGlpiSyncStatusSafe({ ...store.syncStatus });
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

/**
 * Arranque da sincronização GLPI (schema auxiliar, token, primeira sync, cron).
 * Partilhado pelo Next (`instrumentation`) e pelo worker CLI na raiz do monorepo.
 */
export async function bootstrapGlpiSync(options: BootstrapGlpiSyncOptions = {}): Promise<void> {
  const store = getGlpiStore();
  const enableHmrGuard = options.enableHmrGuard ?? true;
  if (enableHmrGuard && store.nextCronStarted) {
    return;
  }

  await recordGlpiBootstrapCheckpoint("bootstrap_enter");
  await ensureSqliteSchema().catch((error) => {
    logger.error(
      { error: toErrorLog(error) },
      "Arranque GLPI: ligação à base de dados falhou; a primeira sync pode falhar até DATABASE_URL estar correta. O cron continua a ser agendado."
    );
  });
  await recordGlpiBootstrapCheckpoint("after_ensure_db");
  await recordGlpiBootstrapCheckpoint("before_openapi_doc");
  await loadOpenApiSpec().catch((error) => {
    logger.warn({ error: toErrorLog(error) }, "Falha no carregamento inicial do doc OpenAPI");
  });
  await recordGlpiBootstrapCheckpoint("after_openapi");
  await getAccessToken().catch((error) => {
    logger.warn({ error: toErrorLog(error) }, "Falha na autenticação inicial; o cron fará novas tentativas");
  });
  await recordGlpiBootstrapCheckpoint("after_token");
  await recordGlpiBootstrapCheckpoint("before_run_sync");
  /**
   * No Next.js, aguardar a primeira sync completa bloqueava o fim do bootstrap (muitos tickets / GLPI lento)
   * e atrasava `bootstrap_done`, cron e gravações em SyncState. No worker (`enableHmrGuard: false`)
   * mantemos await para o processo CLI refletir erros logo na consola.
   */
  if (enableHmrGuard) {
    void runSyncWithGuard().catch((error) => {
      logger.error(
        { error: toErrorLog(error) },
        "Primeira sincronização GLPI em segundo plano falhou (o cron voltará a tentar)"
      );
    });
    await recordGlpiBootstrapCheckpoint("first_sync_delegated");
  } else {
    await runSyncWithGuard();
  }
  /** Sempre agenda o cron para retentar sync/GLPI após falhas transitórias (Railway, rede, etc.). */
  startGlpiSyncCron();
  await recordGlpiBootstrapCheckpoint("after_cron");
  if (enableHmrGuard) {
    store.nextCronStarted = true;
  }
  await recordGlpiBootstrapCheckpoint("bootstrap_done");
}

type GlpiBootstrapGlobal = typeof globalThis & {
  /** Uma única promessa de arranque por processo Node (instrumentation + rotas API). */
  __glpiBootstrapNextPromise?: Promise<void>;
};

/**
 * Arranque GLPI no Next.js, **deduplicado** em `globalThis`.
 * Em alguns deploys o `instrumentation.register()` não corre ou corre antes da BD estar pronta;
 * o primeiro `GET /api/glpi/status` chama a mesma função como rede de segurança.
 */
export function bootstrapGlpiSyncInNext(): Promise<void> {
  const g = globalThis as GlpiBootstrapGlobal;
  if (!g.__glpiBootstrapNextPromise) {
    g.__glpiBootstrapNextPromise = bootstrapGlpiSync({ enableHmrGuard: true }).catch((error) => {
      g.__glpiBootstrapNextPromise = undefined;
      throw error;
    });
  }
  return g.__glpiBootstrapNextPromise;
}

/** Processo dedicado (CLI `tsx apps/frontend/scripts/glpi-worker-cli.ts`): mesma lógica, sem guard de HMR. */
export async function bootstrapGlpiWorkerProcess(): Promise<void> {
  await bootstrapGlpiSync({ enableHmrGuard: false });
}
