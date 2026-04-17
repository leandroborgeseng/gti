import { prisma } from "./config/prisma";
import { logger } from "./config/logger";
import { toErrorLog } from "./errors";

const isBuildStub = process.env.GLPI_SKIP_BOOTSTRAP === "1";

/** Chave em `SyncState` para o último estado da sincronização GLPI (partilhado entre processos). */
export const GLPI_SYNC_STATUS_STATE_KEY = "glpi_sync_status_v1";

/** Última fase conhecida do `bootstrapGlpiSync` (diagnóstico quando `glpi_sync_status_v1` ainda não existe). */
export const GLPI_BOOTSTRAP_LAST_KEY = "glpi_bootstrap_last_v1";

export type GlpiBootstrapCheckpoint = {
  phase: string;
  at: string;
};

export async function recordGlpiBootstrapCheckpoint(phase: string): Promise<void> {
  try {
    const payload = JSON.stringify({ phase, at: new Date().toISOString() });
    await prisma.syncState.upsert({
      where: { key: GLPI_BOOTSTRAP_LAST_KEY },
      create: { key: GLPI_BOOTSTRAP_LAST_KEY, value: payload },
      update: { value: payload }
    });
  } catch (error) {
    logger.warn(
      { error: toErrorLog(error), phase },
      "Não foi possível gravar o checkpoint de arranque GLPI em SyncState"
    );
  }
}

export async function readGlpiBootstrapLastCheckpoint(): Promise<GlpiBootstrapCheckpoint | null> {
  try {
    const row = await prisma.syncState.findUnique({ where: { key: GLPI_BOOTSTRAP_LAST_KEY } });
    const raw = row?.value;
    if (typeof raw !== "string" || raw.length === 0) return null;
    const o = JSON.parse(raw) as { phase?: unknown; at?: unknown };
    if (typeof o.phase !== "string" || typeof o.at !== "string") return null;
    return { phase: o.phase, at: o.at };
  } catch {
    return null;
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
