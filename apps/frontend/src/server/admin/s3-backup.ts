import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Object
} from "@aws-sdk/client-s3";
import type { S3BackupConfig } from "@prisma/client";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import cron, { type ScheduledTask } from "node-cron";
import { prisma } from "@/glpi/config/prisma";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";
import {
  BACKUP_RESTORE_CONFIRM_PHRASE,
  cleanupBackupPaths,
  createSystemBackup,
  restoreSystemBackup
} from "@/server/admin/system-backup";

const CONFIG_ID = "default";
const DEFAULT_PREFIX = "gti/backups";

export type S3BackupTier = "daily" | "weekly" | "monthly";

export type S3BackupPublicConfig = {
  enabled: boolean;
  configured: boolean;
  hasSecret: boolean;
  status: "ativo" | "desabilitado" | "incompleto" | "em_execucao";
  bucket: string;
  region: string;
  accessKeyId: string;
  endpoint: string | null;
  forcePathStyle: boolean;
  prefix: string;
  hour: number;
  timezone: string;
  cron: string;
  cronRegistered: boolean;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
  running: boolean;
  lastRun: {
    at: string;
    ok: boolean;
    error?: string;
    triggeredBy: "cron" | "manual";
    objectKey?: string | null;
    bytes?: number | null;
  } | null;
};

export type S3BackupConfigInput = {
  enabled: boolean;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey?: string;
  endpoint?: string | null;
  forcePathStyle?: boolean;
  prefix: string;
  hour: number;
  timezone: string;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
};

export type S3BackupObjectItem = {
  tier: S3BackupTier;
  key: string;
  size: number;
  lastModified: string | null;
};

type RuntimeConfig = {
  enabled: boolean;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string | null;
  forcePathStyle: boolean;
  prefix: string;
  hour: number;
  timezone: string;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
};

type S3BackupGlobal = {
  task: ScheduledTask | null;
  cronKey: string;
  running: boolean;
  client: S3Client | null;
  clientFingerprint: string;
};

function gtiS3BackupGlobal(): S3BackupGlobal {
  const g = globalThis as typeof globalThis & { __gtiS3Backup?: S3BackupGlobal };
  if (!g.__gtiS3Backup) {
    g.__gtiS3Backup = {
      task: null,
      cronKey: "",
      running: false,
      client: null,
      clientFingerprint: ""
    };
  }
  return g.__gtiS3Backup;
}

function cronFromHour(hour: number): string {
  const h = Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.floor(hour))) : 3;
  return `0 ${h} * * *`;
}

function assertValidTimezone(tz: string): void {
  Intl.DateTimeFormat("en-US", { timeZone: tz });
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isRowConfigured(row: S3BackupConfig): boolean {
  return Boolean(
    row.bucket?.trim() && row.region?.trim() && row.accessKeyId?.trim() && row.secretAccessKeyEnc
  );
}

function toRuntime(row: S3BackupConfig): RuntimeConfig {
  let secretAccessKey = "";
  if (row.secretAccessKeyEnc) {
    try {
      secretAccessKey = decryptSecret(row.secretAccessKeyEnc);
    } catch (err) {
      console.error(
        "[s3-backup] Não foi possível descriptografar a chave S3 (BACKUP_ENCRYPTION_KEY/JWT_SECRET mudou?):",
        err instanceof Error ? err.message : err
      );
    }
  }
  return {
    enabled: row.enabled,
    bucket: row.bucket.trim(),
    region: row.region.trim(),
    accessKeyId: row.accessKeyId.trim(),
    secretAccessKey,
    endpoint: row.endpoint?.trim() || null,
    forcePathStyle: row.forcePathStyle,
    prefix: (row.prefix.trim() || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, ""),
    hour: row.hour,
    timezone: row.timezone.trim() || "America/Sao_Paulo",
    keepDaily: row.keepDaily,
    keepWeekly: row.keepWeekly,
    keepMonthly: row.keepMonthly
  };
}

function isRuntimeConfigured(runtime: RuntimeConfig): boolean {
  return Boolean(runtime.bucket && runtime.region && runtime.accessKeyId && runtime.secretAccessKey);
}

function ensureClient(runtime: RuntimeConfig): S3Client {
  const state = gtiS3BackupGlobal();
  const fp = [
    runtime.region,
    runtime.accessKeyId,
    runtime.secretAccessKey,
    runtime.endpoint ?? "",
    String(runtime.forcePathStyle)
  ].join("|");
  if (!state.client || state.clientFingerprint !== fp) {
    state.client = new S3Client({
      region: runtime.region,
      credentials: {
        accessKeyId: runtime.accessKeyId,
        secretAccessKey: runtime.secretAccessKey
      },
      ...(runtime.endpoint
        ? { endpoint: runtime.endpoint, forcePathStyle: runtime.forcePathStyle }
        : {})
    });
    state.clientFingerprint = fp;
  }
  return state.client;
}

async function ensureRow(): Promise<S3BackupConfig> {
  return prisma.s3BackupConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID },
    update: {}
  });
}

async function loadRow(): Promise<S3BackupConfig> {
  const row = await prisma.s3BackupConfig.findUnique({ where: { id: CONFIG_ID } });
  if (row) return row;
  return ensureRow();
}

/** Importação única a partir de S3_BACKUP_* (como no SIGLM). */
async function maybeImportFromEnv(row: S3BackupConfig): Promise<S3BackupConfig> {
  if (row.envImportedAt || row.bucket || row.accessKeyId || row.secretAccessKeyEnc) {
    return row;
  }

  const bucket = process.env.S3_BACKUP_BUCKET?.trim();
  const region = process.env.S3_BACKUP_REGION?.trim();
  const accessKeyId = process.env.S3_BACKUP_ACCESS_KEY_ID?.trim();
  const secret = process.env.S3_BACKUP_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !region || !accessKeyId || !secret) return row;

  const parts = (process.env.S3_BACKUP_CRON?.trim() || "0 3 * * *").split(/\s+/);
  const hour = Number(parts[1] ?? 3);

  const updated = await prisma.s3BackupConfig.update({
    where: { id: CONFIG_ID },
    data: {
      enabled: (process.env.S3_BACKUP_ENABLED ?? "").toLowerCase() === "true",
      bucket,
      region,
      accessKeyId,
      secretAccessKeyEnc: encryptSecret(secret),
      endpoint: process.env.S3_BACKUP_ENDPOINT?.trim() || null,
      forcePathStyle: (process.env.S3_BACKUP_FORCE_PATH_STYLE ?? "true").toLowerCase() !== "false",
      prefix: (process.env.S3_BACKUP_PREFIX?.trim() || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, ""),
      hour: clampInt(hour, 0, 23, 3),
      timezone: process.env.S3_BACKUP_TZ?.trim() || "America/Sao_Paulo",
      keepDaily: clampInt(Number(process.env.S3_BACKUP_KEEP_DAILY ?? 7), 1, 90, 7),
      keepWeekly: clampInt(Number(process.env.S3_BACKUP_KEEP_WEEKLY ?? 5), 1, 52, 5),
      keepMonthly: clampInt(Number(process.env.S3_BACKUP_KEEP_MONTHLY ?? 12), 1, 120, 12),
      envImportedAt: new Date()
    }
  });
  console.info("[s3-backup] Configuração importada das variáveis S3_BACKUP_* (única vez)");
  return updated;
}

function tiersForToday(timezone: string): S3BackupTier[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric"
  }).formatToParts(new Date());
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "0");

  const tiers: S3BackupTier[] = ["daily"];
  if (weekday === "Sun") tiers.push("weekly");
  if (day === 1) tiers.push("monthly");
  return tiers;
}

async function listAll(client: S3Client, bucket: string, prefix: string): Promise<_Object[]> {
  const out: _Object[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token
      })
    );
    if (res.Contents?.length) out.push(...res.Contents);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out.filter((o) => o.Key && !o.Key.endsWith("/"));
}

async function pruneTier(
  client: S3Client,
  bucket: string,
  prefixRoot: string,
  tier: S3BackupTier,
  keep: number
): Promise<number> {
  if (keep < 1) return 0;
  const prefix = `${prefixRoot}/${tier}/`;
  const objects = await listAll(client, bucket, prefix);
  objects.sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));
  const toDelete = objects.slice(keep).filter((o) => o.Key);
  if (!toDelete.length) return 0;

  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 1000) {
    const chunk = toDelete.slice(i, i + 1000);
    const res = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk.map((o) => ({ Key: o.Key! })),
          Quiet: true
        }
      })
    );
    deleted += chunk.length - (res.Errors?.length ?? 0);
    if (res.Errors?.length) {
      console.warn(
        `[s3-backup] Falha ao apagar ${res.Errors.length} objeto(s) em ${prefix}: ${res.Errors[0]?.Message}`
      );
    }
  }
  if (deleted > 0) {
    console.info(`[s3-backup] Retenção ${tier}: removidos ${deleted} (keep=${keep})`);
  }
  return deleted;
}

async function persistLastRun(data: {
  ok: boolean;
  triggeredBy: "cron" | "manual";
  error?: string;
  objectKey?: string | null;
  bytes?: number | null;
}): Promise<void> {
  await prisma.s3BackupConfig.update({
    where: { id: CONFIG_ID },
    data: {
      lastRunAt: new Date(),
      lastRunStatus: data.ok ? "ok" : "error",
      lastRunError: data.error?.slice(0, 4000) ?? null,
      lastRunTrigger: data.triggeredBy,
      lastRunObjectKey: data.objectKey ?? null,
      lastRunBytes: data.bytes != null ? BigInt(data.bytes) : null
    }
  });
}

export async function getS3BackupPublicConfig(): Promise<S3BackupPublicConfig> {
  let row = await loadRow();
  row = await maybeImportFromEnv(row);
  const state = gtiS3BackupGlobal();
  const configured = isRowConfigured(row);
  let status: S3BackupPublicConfig["status"] = "desabilitado";
  if (state.running) status = "em_execucao";
  else if (!row.enabled) status = "desabilitado";
  else if (!configured) status = "incompleto";
  else status = "ativo";

  return {
    enabled: row.enabled,
    configured,
    hasSecret: Boolean(row.secretAccessKeyEnc),
    status,
    bucket: row.bucket,
    region: row.region,
    accessKeyId: row.accessKeyId,
    endpoint: row.endpoint,
    forcePathStyle: row.forcePathStyle,
    prefix: row.prefix || DEFAULT_PREFIX,
    hour: row.hour,
    timezone: row.timezone,
    cron: cronFromHour(row.hour),
    cronRegistered: Boolean(state.task) && state.cronKey.length > 0,
    keepDaily: row.keepDaily,
    keepWeekly: row.keepWeekly,
    keepMonthly: row.keepMonthly,
    running: state.running,
    lastRun: row.lastRunAt
      ? {
          at: row.lastRunAt.toISOString(),
          ok: row.lastRunStatus === "ok",
          error: row.lastRunError ?? undefined,
          triggeredBy: row.lastRunTrigger === "cron" ? "cron" : "manual",
          objectKey: row.lastRunObjectKey,
          bytes: row.lastRunBytes != null ? Number(row.lastRunBytes) : null
        }
      : null
  };
}

export async function updateS3BackupConfig(input: S3BackupConfigInput): Promise<S3BackupPublicConfig> {
  await ensureRow();
  const current = await loadRow();

  const bucket = input.bucket.trim();
  const region = input.region.trim();
  const accessKeyId = input.accessKeyId.trim();
  const prefix = (input.prefix.trim() || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, "");
  const timezone = input.timezone.trim() || "America/Sao_Paulo";
  const endpoint = input.endpoint?.trim() ? input.endpoint.trim() : null;
  const secretIncoming = input.secretAccessKey?.trim() ?? "";

  let secretAccessKeyEnc = current.secretAccessKeyEnc;
  if (secretIncoming) {
    secretAccessKeyEnc = encryptSecret(secretIncoming);
  }

  if (input.enabled) {
    if (!bucket || !region || !accessKeyId) {
      throw new Error("Para ativar, preencha bucket, região e chave de acesso.");
    }
    if (!secretAccessKeyEnc) {
      throw new Error("Para ativar, informe a chave secreta (Secret Access Key).");
    }
    try {
      assertValidTimezone(timezone);
    } catch {
      throw new Error(`Fuso horário inválido: ${timezone}`);
    }
  }

  await prisma.s3BackupConfig.update({
    where: { id: CONFIG_ID },
    data: {
      enabled: input.enabled,
      bucket,
      region,
      accessKeyId,
      secretAccessKeyEnc,
      endpoint,
      forcePathStyle: input.forcePathStyle ?? true,
      prefix,
      hour: clampInt(input.hour, 0, 23, 3),
      timezone,
      keepDaily: clampInt(input.keepDaily, 1, 90, 7),
      keepWeekly: clampInt(input.keepWeekly, 1, 52, 5),
      keepMonthly: clampInt(input.keepMonthly, 1, 120, 12)
    }
  });

  const state = gtiS3BackupGlobal();
  state.client = null;
  state.clientFingerprint = "";
  await refreshS3BackupCron();
  return getS3BackupPublicConfig();
}

async function executeBackup(triggeredBy: "cron" | "manual"): Promise<S3BackupPublicConfig["lastRun"]> {
  const state = gtiS3BackupGlobal();
  if (state.running) {
    throw new Error("Já existe um backup S3 em andamento.");
  }

  const row = await loadRow();
  const runtime = toRuntime(row);
  if (!runtime.enabled) {
    throw new Error("Backup S3 desabilitado. Ative e salve na interface.");
  }
  if (!isRuntimeConfigured(runtime)) {
    throw new Error("Backup S3 incompleto. Preencha bucket, região e chaves.");
  }

  state.running = true;
  let archivePath = "";
  let workDir = "";
  const uploaded: { tier: S3BackupTier; key: string }[] = [];

  try {
    const client = ensureClient(runtime);
    const created = await createSystemBackup({ includeUploads: true });
    archivePath = created.archivePath;
    workDir = created.workDir;
    const fileStat = await stat(archivePath);
    const tiers = tiersForToday(runtime.timezone);

    for (const tier of tiers) {
      const key = `${runtime.prefix}/${tier}/${created.filename}`;
      await client.send(
        new PutObjectCommand({
          Bucket: runtime.bucket,
          Key: key,
          Body: createReadStream(archivePath),
          ContentType: "application/gzip",
          ContentLength: fileStat.size,
          Metadata: {
            "gti-tier": tier,
            "gti-triggered": triggeredBy
          }
        })
      );
      uploaded.push({ tier, key });
      console.info(`[s3-backup] Enviado s3://${runtime.bucket}/${key} (${fileStat.size} bytes)`);
    }

    for (const tier of ["daily", "weekly", "monthly"] as S3BackupTier[]) {
      const keep =
        tier === "daily" ? runtime.keepDaily : tier === "weekly" ? runtime.keepWeekly : runtime.keepMonthly;
      await pruneTier(client, runtime.bucket, runtime.prefix, tier, keep);
    }

    const primaryKey = uploaded[0]?.key ?? null;
    await persistLastRun({
      ok: true,
      triggeredBy,
      objectKey: primaryKey,
      bytes: fileStat.size
    });

    return {
      at: new Date().toISOString(),
      ok: true,
      triggeredBy,
      objectKey: primaryKey,
      bytes: fileStat.size
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await persistLastRun({
      ok: false,
      triggeredBy,
      error: message,
      objectKey: uploaded[0]?.key ?? null
    }).catch(() => undefined);
    throw err;
  } finally {
    state.running = false;
    await cleanupBackupPaths(archivePath, workDir);
  }
}

export async function runS3BackupNow(): Promise<NonNullable<S3BackupPublicConfig["lastRun"]>> {
  const result = await executeBackup("manual");
  if (!result) throw new Error("Backup S3 sem resultado.");
  return result;
}

export async function listS3BackupObjects(): Promise<{ items: S3BackupObjectItem[] }> {
  const row = await loadRow();
  const runtime = toRuntime(row);
  if (!isRuntimeConfigured(runtime)) {
    throw new Error("Backup S3 incompleto. Configure bucket e chaves antes de listar.");
  }

  const client = ensureClient(runtime);
  const items: S3BackupObjectItem[] = [];
  for (const tier of ["daily", "weekly", "monthly"] as S3BackupTier[]) {
    const listed = await listAll(client, runtime.bucket, `${runtime.prefix}/${tier}/`);
    for (const obj of listed) {
      items.push({
        tier,
        key: obj.Key!,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified?.toISOString() ?? null
      });
    }
  }
  items.sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? ""));
  return { items };
}

async function downloadObject(client: S3Client, bucket: string, key: string, dest: string): Promise<void> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) {
    throw new Error("Objeto S3 vazio.");
  }
  // Prefer streaming when available
  const body = response.Body as { transformToByteArray?: () => Promise<Uint8Array>; pipe?: unknown };
  if (typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    await writeFile(dest, Buffer.from(bytes));
    return;
  }
  await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(dest));
}

export async function restoreS3BackupFromObject(options: {
  objectKey: string;
  confirmPhrase: string;
  restoreUploads: boolean;
}): Promise<{
  ok: boolean;
  message: string;
  objectKey: string;
  databaseRestored: boolean;
  uploadsRestored: boolean;
  warnings: string[];
}> {
  const phrase = options.confirmPhrase.trim().toUpperCase();
  if (phrase !== BACKUP_RESTORE_CONFIRM_PHRASE) {
    throw new Error(
      `Confirmação inválida. Digite exatamente «${BACKUP_RESTORE_CONFIRM_PHRASE}» para restaurar.`
    );
  }

  const state = gtiS3BackupGlobal();
  if (state.running) {
    throw new Error("Há um backup S3 em execução. Aguarde a conclusão antes de restaurar.");
  }

  const objectKey = options.objectKey.trim();
  if (!objectKey) {
    throw new Error("Informe a chave do objeto no S3.");
  }

  const row = await loadRow();
  const runtime = toRuntime(row);
  if (!isRuntimeConfigured(runtime)) {
    throw new Error("Backup S3 incompleto. Configure bucket e chaves antes de restaurar.");
  }

  // Segurança: só permite chaves sob o prefixo configurado.
  const allowedPrefix = `${runtime.prefix}/`;
  if (!objectKey.startsWith(allowedPrefix)) {
    throw new Error("A chave do objeto está fora do prefixo configurado para backups.");
  }

  const workDir = await mkdtemp(join(tmpdir(), "gti-s3-restore-"));
  const archivePath = join(workDir, basename(objectKey) || "backup.tar.gz");

  try {
    const client = ensureClient(runtime);
    await downloadObject(client, runtime.bucket, objectKey, archivePath);
    const result = await restoreSystemBackup({
      archivePath,
      restoreUploads: options.restoreUploads,
      confirmPhrase: BACKUP_RESTORE_CONFIRM_PHRASE
    });
    return {
      ok: true,
      message:
        "Restauração a partir do S3 concluída. Valide o login e as variáveis de ambiente. Pode ser necessário voltar a autenticar-se.",
      objectKey,
      databaseRestored: result.databaseRestored,
      uploadsRestored: result.uploadsRestored,
      warnings: result.warnings
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** (Re)agenda o cron diário conforme a config atual. */
export async function refreshS3BackupCron(): Promise<void> {
  const state = gtiS3BackupGlobal();
  if (state.task) {
    state.task.stop();
    state.task = null;
    state.cronKey = "";
  }

  let row = await loadRow();
  row = await maybeImportFromEnv(row);

  if (!row.enabled || !isRowConfigured(row)) {
    console.info("[s3-backup] Agendamento parado (desabilitado ou incompleto)");
    return;
  }

  try {
    assertValidTimezone(row.timezone);
  } catch {
    console.warn(`[s3-backup] Fuso inválido (${row.timezone}); agendamento não iniciado`);
    return;
  }

  const expression = cronFromHour(row.hour);
  if (!cron.validate(expression)) {
    console.warn(`[s3-backup] Expressão cron inválida: ${expression}`);
    return;
  }

  const cronKey = `${expression}|${row.timezone}`;
  state.task = cron.schedule(
    expression,
    () => {
      void executeBackup("cron").catch((err) => {
        console.error(
          "[s3-backup] Falha no backup agendado:",
          err instanceof Error ? err.message : err
        );
      });
    },
    { timezone: row.timezone }
  );
  state.cronKey = cronKey;
  console.info(
    `[s3-backup] Agendado ${expression} (${row.timezone}) → s3://${row.bucket}/${row.prefix || DEFAULT_PREFIX}`
  );
}

/**
 * Arranque no Next (instrumentation) / worker: garante linha, importa env e agenda cron.
 */
export async function bootstrapS3BackupCron(): Promise<void> {
  try {
    await ensureRow();
    await refreshS3BackupCron();
  } catch (err) {
    console.error(
      "[s3-backup] Falha ao iniciar agendamento:",
      err instanceof Error ? err.message : err
    );
  }
}
