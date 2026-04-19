import { prisma } from "./config/prisma";
import { logger } from "./config/logger";
import { toErrorLog } from "./errors";

const isBuildStub = process.env.GLPI_SKIP_BOOTSTRAP === "1";

/** Chave em `SyncState` para o último estado da sincronização GLPI (partilhado entre processos). */
export const GLPI_SYNC_STATUS_STATE_KEY = "glpi_sync_status_v1";

/** Legado: antes Next e worker partilhavam a mesma chave (falsos avisos multi-réplica). */
export const GLPI_BOOTSTRAP_LAST_KEY = "glpi_bootstrap_last_v1";

/** Checkpoints do processo Next (instrumentation / API). */
export const GLPI_BOOTSTRAP_LAST_KEY_NEXT = "glpi_bootstrap_last_v1_next";

/** Checkpoints do worker CLI (`glpi-worker-cli.ts`). */
export const GLPI_BOOTSTRAP_LAST_KEY_WORKER = "glpi_bootstrap_last_v1_worker";

/** Legado: marcador único de bootstrap concluído. */
export const GLPI_BOOTSTRAP_DONE_KEY = "glpi_bootstrap_done_v1";

export const GLPI_BOOTSTRAP_DONE_KEY_NEXT = "glpi_bootstrap_done_v1_next";
export const GLPI_BOOTSTRAP_DONE_KEY_WORKER = "glpi_bootstrap_done_v1_worker";

export function isGlpiWorkerProcess(): boolean {
  return process.env.GLPI_WORKER_PROCESS === "1";
}

export type GlpiBootstrapCheckpoint = {
  phase: string;
  at: string;
};

function bootstrapLastKeyForWriter(): string {
  return isGlpiWorkerProcess() ? GLPI_BOOTSTRAP_LAST_KEY_WORKER : GLPI_BOOTSTRAP_LAST_KEY_NEXT;
}

function bootstrapDoneKeyForWriter(): string {
  return isGlpiWorkerProcess() ? GLPI_BOOTSTRAP_DONE_KEY_WORKER : GLPI_BOOTSTRAP_DONE_KEY_NEXT;
}

function parseCheckpointValue(raw: string): GlpiBootstrapCheckpoint | null {
  try {
    const o = JSON.parse(raw) as { phase?: unknown; at?: unknown };
    if (typeof o.phase !== "string" || typeof o.at !== "string") return null;
    return { phase: o.phase, at: o.at };
  } catch {
    return null;
  }
}

async function readCheckpointByKey(key: string): Promise<GlpiBootstrapCheckpoint | null> {
  const row = await prisma.syncState.findUnique({ where: { key } });
  const raw = row?.value;
  if (typeof raw !== "string" || raw.length === 0) return null;
  return parseCheckpointValue(raw);
}

export async function recordGlpiBootstrapCheckpoint(phase: string): Promise<void> {
  try {
    const payload = JSON.stringify({ phase, at: new Date().toISOString() });
    const key = bootstrapLastKeyForWriter();
    await prisma.syncState.upsert({
      where: { key },
      create: { key, value: payload },
      update: { value: payload }
    });
  } catch (error) {
    logger.warn(
      { error: toErrorLog(error), phase },
      "Não foi possível gravar o checkpoint de arranque GLPI em SyncState"
    );
  }
}

/** Último checkpoint do **Next** (chave nova), ou legado `glpi_bootstrap_last_v1` se ainda não migrado. */
export async function readGlpiBootstrapLastCheckpoint(): Promise<GlpiBootstrapCheckpoint | null> {
  try {
    const next = await readCheckpointByKey(GLPI_BOOTSTRAP_LAST_KEY_NEXT);
    if (next) return next;
    return await readCheckpointByKey(GLPI_BOOTSTRAP_LAST_KEY);
  } catch {
    return null;
  }
}

/**
 * Espera até existir checkpoint de arranque na BD (ou timeout).
 * Evita corrida em `/api/glpi/status`: o bootstrap começa com `void` e o primeiro `upsert` é assíncrono.
 */
export async function waitForBootstrapCheckpointVisible(timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cp = await readGlpiBootstrapLastCheckpoint();
    if (cp) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

/** Último checkpoint do **worker** CLI (processo separado). */
export async function readGlpiBootstrapLastCheckpointWorker(): Promise<GlpiBootstrapCheckpoint | null> {
  try {
    return await readCheckpointByKey(GLPI_BOOTSTRAP_LAST_KEY_WORKER);
  } catch {
    return null;
  }
}

export async function recordGlpiBootstrapDoneMarker(): Promise<void> {
  try {
    const at = new Date().toISOString();
    const key = bootstrapDoneKeyForWriter();
    await prisma.syncState.upsert({
      where: { key },
      create: { key, value: at },
      update: { value: at }
    });
  } catch (error) {
    logger.warn({ error: toErrorLog(error) }, "Não foi possível gravar o marcador de bootstrap concluído");
  }
}

async function readDoneIsoByKey(key: string): Promise<string | null> {
  const row = await prisma.syncState.findUnique({ where: { key } });
  const raw = row?.value?.trim();
  if (!raw) return null;
  if (Number.isNaN(Date.parse(raw))) return null;
  return raw;
}

/** Data ISO do último `bootstrap_done` no processo **Next** (ou legado). */
export async function readGlpiBootstrapDoneAt(): Promise<string | null> {
  try {
    const next = await readDoneIsoByKey(GLPI_BOOTSTRAP_DONE_KEY_NEXT);
    if (next) return next;
    return await readDoneIsoByKey(GLPI_BOOTSTRAP_DONE_KEY);
  } catch {
    return null;
  }
}

/** Data ISO do último `bootstrap_done` no **worker** CLI. */
export async function readGlpiBootstrapDoneAtWorker(): Promise<string | null> {
  try {
    return await readDoneIsoByKey(GLPI_BOOTSTRAP_DONE_KEY_WORKER);
  } catch {
    return null;
  }
}

/**
 * Se a BD indica sync em curso sem `lastFinishedAt` há mais de `GLPI_SYNC_ORPHAN_MS` ms, normaliza
 * (reinício do contentor / réplica morta a meio da sync).
 */
export async function limparSyncOrfaNaBdSeNecessario(): Promise<void> {
  try {
    const rawMs = process.env.GLPI_SYNC_ORPHAN_MS?.trim();
    const limiteMs = rawMs ? Math.max(120_000, Number(rawMs) || 14_400_000) : 14_400_000;

    const snap = await readGlpiSyncStatusFromDb();
    if (!snap?.isRunning || snap.lastFinishedAt) return;
    if (!snap.lastStartedAt) return;
    const t = Date.parse(snap.lastStartedAt);
    if (Number.isNaN(t)) return;
    if (Date.now() - t < limiteMs) return;

    const { persistedAt: _p, ...rest } = snap;
    await writeGlpiSyncStatusToDb({
      ...rest,
      isRunning: false,
      lastFinishedAt: new Date().toISOString(),
      lastError: rest.lastError || "Estado órfão: sync interrompida (reinício do processo ou excedeu GLPI_SYNC_ORPHAN_MS)."
    });
    logger.warn(
      { lastStartedAt: snap.lastStartedAt, limiteMs },
      "Estado de sync órfão na BD normalizado antes de nova execução"
    );
  } catch (error) {
    logger.warn({ error: toErrorLog(error) }, "Não foi possível normalizar estado de sync órfão na BD");
  }
}

export type GlpiSyncStatusSnapshot = {
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
  /** Quando este registo foi gravado na base (ISO). */
  persistedAt: string;
};

const STALE_RUN_MS = 3 * 60 * 60 * 1000;

export function isStaleRunningSync(lastStartedAt: string | null, isRunning: boolean): boolean {
  if (!isRunning || !lastStartedAt) return false;
  const t = Date.parse(lastStartedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t > STALE_RUN_MS;
}

export type GlpiSyncStatusDbRead = {
  snapshot: GlpiSyncStatusSnapshot | null;
  /** Existe linha em `SyncState` com `value` não vazio. */
  linhaComValor: boolean;
  comprimentoValor: number;
  /** JSON inválido ou falta o campo numérico `runs`. */
  parseInvalido: boolean;
  erroPrisma: string | null;
};

function parseSnapshotFromJsonString(raw: string): GlpiSyncStatusSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<GlpiSyncStatusSnapshot>;
    if (typeof parsed.runs !== "number") return null;
    return {
      isRunning: Boolean(parsed.isRunning),
      runs: parsed.runs,
      lastStartedAt: typeof parsed.lastStartedAt === "string" ? parsed.lastStartedAt : null,
      lastFinishedAt: typeof parsed.lastFinishedAt === "string" ? parsed.lastFinishedAt : null,
      lastSuccessAt: typeof parsed.lastSuccessAt === "string" ? parsed.lastSuccessAt : null,
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
      lastLoaded: Number(parsed.lastLoaded) || 0,
      lastSaved: Number(parsed.lastSaved) || 0,
      lastFailed: Number(parsed.lastFailed) || 0,
      lastPage: Number(parsed.lastPage) || 0,
      persistedAt:
        typeof parsed.persistedAt === "string" ? parsed.persistedAt : new Date(0).toISOString()
    };
  } catch {
    return null;
  }
}

/** Leitura detalhada para diagnóstico em `/api/glpi/status`. */
export async function readGlpiSyncStatusFromDbDetailed(): Promise<GlpiSyncStatusDbRead> {
  try {
    const row = await prisma.syncState.findUnique({ where: { key: GLPI_SYNC_STATUS_STATE_KEY } });
    const raw = row?.value;
    if (typeof raw !== "string" || raw.length === 0) {
      return {
        snapshot: null,
        linhaComValor: false,
        comprimentoValor: 0,
        parseInvalido: false,
        erroPrisma: null
      };
    }
    const comprimentoValor = raw.length;
    const snapshot = parseSnapshotFromJsonString(raw);
    return {
      snapshot,
      linhaComValor: true,
      comprimentoValor,
      parseInvalido: snapshot === null,
      erroPrisma: null
    };
  } catch (error) {
    const erroPrisma = error instanceof Error ? error.message : String(error);
    return {
      snapshot: null,
      linhaComValor: false,
      comprimentoValor: 0,
      parseInvalido: false,
      erroPrisma
    };
  }
}

export async function readGlpiSyncStatusFromDb(): Promise<GlpiSyncStatusSnapshot | null> {
  const r = await readGlpiSyncStatusFromDbDetailed();
  return r.snapshot;
}

export async function writeGlpiSyncStatusToDb(
  status: Omit<GlpiSyncStatusSnapshot, "persistedAt">
): Promise<void> {
  const payload: GlpiSyncStatusSnapshot = {
    ...status,
    persistedAt: new Date().toISOString()
  };
  await prisma.syncState.upsert({
    where: { key: GLPI_SYNC_STATUS_STATE_KEY },
    create: { key: GLPI_SYNC_STATUS_STATE_KEY, value: JSON.stringify(payload) },
    update: { value: JSON.stringify(payload) }
  });
}

export async function persistGlpiSyncStatusSafe(
  status: Omit<GlpiSyncStatusSnapshot, "persistedAt">
): Promise<void> {
  try {
    await writeGlpiSyncStatusToDb(status);
  } catch (error) {
    const details = toErrorLog(error);
    if (isBuildStub) {
      logger.warn({ error: details }, "Persistência SyncState ignorada durante build");
    } else {
      logger.error(
        { error: details },
        "Não foi possível persistir o estado da sincronização GLPI em SyncState — verifique DATABASE_URL e migrações"
      );
    }
  }
}

/**
 * Combina o estado em memória (processo atual) com o último registo na BD
 * (outro processo / worker / réplica).
 */
export function mergeGlpiSyncStatusForApi(
  db: GlpiSyncStatusSnapshot | null,
  mem: Omit<GlpiSyncStatusSnapshot, "persistedAt">
): Omit<GlpiSyncStatusSnapshot, "persistedAt"> & { persistedAt?: string } {
  if (!db) {
    return { ...mem };
  }
  const dbStale = isStaleRunningSync(db.lastStartedAt, db.isRunning);
  const dbRunning = db.isRunning && !dbStale;
  return {
    isRunning: dbRunning || mem.isRunning,
    runs: Math.max(db.runs, mem.runs),
    lastStartedAt: maxIsoNullable(db.lastStartedAt, mem.lastStartedAt),
    lastFinishedAt: maxIsoNullable(db.lastFinishedAt, mem.lastFinishedAt),
    lastSuccessAt: maxIsoNullable(db.lastSuccessAt, mem.lastSuccessAt),
    lastError: pickLatestError(db, mem),
    lastLoaded: Math.max(db.lastLoaded, mem.lastLoaded),
    lastSaved: Math.max(db.lastSaved, mem.lastSaved),
    lastFailed: Math.max(db.lastFailed, mem.lastFailed),
    lastPage: Math.max(db.lastPage, mem.lastPage),
    persistedAt: db.persistedAt
  };
}

function maxIsoNullable(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function pickLatestError(
  db: GlpiSyncStatusSnapshot,
  mem: Omit<GlpiSyncStatusSnapshot, "persistedAt">
): string | null {
  const tDb = db.lastFinishedAt ? Date.parse(db.lastFinishedAt) : 0;
  const tMem = mem.lastFinishedAt ? Date.parse(mem.lastFinishedAt) : 0;
  if (tMem >= tDb) return mem.lastError;
  return db.lastError;
}
