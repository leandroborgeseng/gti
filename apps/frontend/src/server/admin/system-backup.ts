import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { uploadRootResolved } from "@/lib/attachment-storage";
import {
  BACKUP_ENV_CHECKLIST_KEYS,
  BACKUP_FORMAT_VERSION,
  BACKUP_RESTORE_CONFIRM_PHRASE
} from "@/lib/system-backup-constants";

export {
  BACKUP_ENV_CHECKLIST_KEYS,
  BACKUP_FORMAT_VERSION,
  BACKUP_RESTORE_CONFIRM_PHRASE
} from "@/lib/system-backup-constants";

const execFileAsync = promisify(execFile);

export type BackupEnvChecklistItem = {
  key: string;
  present: boolean;
};

export type BackupManifest = {
  formatVersion: number;
  appName: string;
  createdAt: string;
  includeUploads: boolean;
  database: { format: "pg_dump_custom"; file: string };
  envChecklistFile: string;
  notes: string[];
};

export type CreateBackupResult = {
  archivePath: string;
  filename: string;
  workDir: string;
  manifest: BackupManifest;
};

export type RestoreBackupResult = {
  databaseRestored: boolean;
  uploadsRestored: boolean;
  envChecklist: BackupEnvChecklistItem[];
  manifest: BackupManifest | null;
  warnings: string[];
};

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL não está definida neste servidor.");
  }
  return url;
}

export function buildEnvChecklist(): BackupEnvChecklistItem[] {
  return BACKUP_ENV_CHECKLIST_KEYS.map((key) => ({
    key,
    present: Boolean(process.env[key]?.trim())
  }));
}

export function backupMaxBytes(): number {
  const n = Number(process.env.BACKUP_MAX_MB ?? "512");
  const mb = Number.isFinite(n) && n > 0 ? n : 512;
  return Math.floor(mb * 1024 * 1024);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function runPgDump(dumpPath: string): Promise<void> {
  const databaseUrl = requireDatabaseUrl();
  try {
    await execFileAsync(
      "pg_dump",
      [databaseUrl, "--no-owner", "--no-acl", "--format=custom", `--file=${dumpPath}`],
      { maxBuffer: 8 * 1024 * 1024, env: process.env as NodeJS.ProcessEnv }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ENOENT") || msg.includes("spawn pg_dump")) {
      throw new Error(
        "pg_dump não está disponível neste ambiente. Em Docker use a imagem oficial (já inclui postgresql-client)."
      );
    }
    throw new Error(`Falha ao exportar a base de dados: ${msg}`);
  }
  if (!(await pathExists(dumpPath))) {
    throw new Error("pg_dump terminou sem gerar o ficheiro de dump.");
  }
}

async function runPgRestore(dumpPath: string): Promise<string[]> {
  const databaseUrl = requireDatabaseUrl();
  const warnings: string[] = [];
  try {
    const { stderr } = await execFileAsync(
      "pg_restore",
      ["--no-owner", "--no-acl", "--clean", "--if-exists", "-d", databaseUrl, dumpPath],
      { maxBuffer: 16 * 1024 * 1024, env: process.env as NodeJS.ProcessEnv }
    );
    const errText = typeof stderr === "string" ? stderr.trim() : "";
    if (errText) {
      warnings.push(errText.slice(0, 2000));
    }
  } catch (e: unknown) {
    const err = e as { code?: number | string; message?: string; stderr?: string };
    const code = typeof err.code === "number" ? err.code : Number(err.code);
    const stderr = typeof err.stderr === "string" ? err.stderr.trim() : "";
    // pg_restore costuma sair com 1 quando há avisos de dependências; 0 = ok; >1 = erro real.
    if (code === 1) {
      if (stderr) warnings.push(stderr.slice(0, 2000));
      return warnings;
    }
    const msg = err.message || String(e);
    if (msg.includes("ENOENT") || msg.includes("spawn pg_restore")) {
      throw new Error(
        "pg_restore não está disponível neste ambiente. Em Docker use a imagem oficial (já inclui postgresql-client)."
      );
    }
    throw new Error(`Falha ao restaurar a base de dados: ${stderr || msg}`);
  }
  return warnings;
}

async function tarCreate(workDir: string, archivePath: string): Promise<void> {
  await execFileAsync("tar", ["-czf", archivePath, "-C", workDir, "."], {
    maxBuffer: 4 * 1024 * 1024
  });
}

async function tarExtract(archivePath: string, destDir: string): Promise<void> {
  // Detecta gzip pelo magic number; aceita .tar.gz / .tgz / .gti-backup
  const fd = await readFile(archivePath);
  const isGzip = fd.length >= 2 && fd[0] === 0x1f && fd[1] === 0x8b;
  if (isGzip) {
    await execFileAsync("tar", ["-xzf", archivePath, "-C", destDir], {
      maxBuffer: 4 * 1024 * 1024
    });
    return;
  }
  // Fallback: ficheiro .dump solto (só base de dados)
  const name = basename(archivePath).toLowerCase();
  if (name.endsWith(".dump")) {
    await copyFile(archivePath, join(destDir, "database.dump"));
    await writeFile(
      join(destDir, "manifest.json"),
      JSON.stringify(
        {
          formatVersion: BACKUP_FORMAT_VERSION,
          appName: "gti",
          createdAt: new Date().toISOString(),
          includeUploads: false,
          database: { format: "pg_dump_custom", file: "database.dump" },
          envChecklistFile: "env-checklist.json",
          notes: ["Pacote mínimo: apenas dump PostgreSQL (sem anexos)."]
        } satisfies BackupManifest,
        null,
        2
      ),
      "utf8"
    );
    await writeFile(join(destDir, "env-checklist.json"), "[]", "utf8");
    return;
  }
  throw new Error("Formato de backup não reconhecido. Use o ficheiro .tar.gz gerado pela exportação.");
}

/**
 * Gera um arquivo .tar.gz com dump PostgreSQL, checklist de variáveis (sem segredos)
 * e, opcionalmente, a pasta de anexos.
 */
export async function createSystemBackup(options: {
  includeUploads: boolean;
}): Promise<CreateBackupResult> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `gti-backup-${stamp}.tar.gz`;
  const workDir = await mkdtemp(join(tmpdir(), "gti-backup-export-"));
  const dumpPath = join(workDir, "database.dump");
  const archivePath = join(tmpdir(), filename);

  try {
    await runPgDump(dumpPath);

    const envChecklist = buildEnvChecklist();
    await writeFile(join(workDir, "env-checklist.json"), JSON.stringify(envChecklist, null, 2), "utf8");

    let includeUploads = false;
    if (options.includeUploads) {
      const uploadRoot = uploadRootResolved();
      if (existsSync(uploadRoot)) {
        const entries = await readdir(uploadRoot).catch(() => []);
        if (entries.length > 0) {
          await cp(uploadRoot, join(workDir, "uploads"), { recursive: true });
          includeUploads = true;
        }
      }
    }

    const manifest: BackupManifest = {
      formatVersion: BACKUP_FORMAT_VERSION,
      appName: "gti",
      createdAt: new Date().toISOString(),
      includeUploads,
      database: { format: "pg_dump_custom", file: "database.dump" },
      envChecklistFile: "env-checklist.json",
      notes: [
        "Este pacote contém a base PostgreSQL (formato custom do pg_dump).",
        "Variáveis de ambiente (GLPI, JWT, Resend, etc.) não são exportadas por segurança — configure-as no servidor de destino.",
        "Preferências em SyncState (Kanban, âmbito de sync, etc.) vão no dump da base.",
        includeUploads
          ? "Anexos de medições, glosas e tarefas estão na pasta uploads/."
          : "Anexos não foram incluídos neste pacote."
      ]
    };
    await writeFile(join(workDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    await tarCreate(workDir, archivePath);

    return { archivePath, filename, workDir, manifest };
  } catch (e) {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    await rm(archivePath, { force: true }).catch(() => undefined);
    throw e;
  }
}

export async function cleanupBackupPaths(...paths: string[]): Promise<void> {
  for (const p of paths) {
    if (!p) continue;
    await rm(p, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Restaura dump (+ anexos se existirem no pacote). Operação destrutiva na base atual.
 */
export async function restoreSystemBackup(options: {
  archivePath: string;
  restoreUploads: boolean;
  confirmPhrase: string;
}): Promise<RestoreBackupResult> {
  const phrase = options.confirmPhrase.trim().toUpperCase();
  if (phrase !== BACKUP_RESTORE_CONFIRM_PHRASE) {
    throw new Error(
      `Confirmação inválida. Digite exatamente «${BACKUP_RESTORE_CONFIRM_PHRASE}» para restaurar.`
    );
  }

  const extractDir = await mkdtemp(join(tmpdir(), "gti-backup-import-"));
  const warnings: string[] = [];

  try {
    await tarExtract(options.archivePath, extractDir);

    const dumpPath = join(extractDir, "database.dump");
    if (!(await pathExists(dumpPath))) {
      throw new Error("O pacote não contém database.dump.");
    }

    let manifest: BackupManifest | null = null;
    const manifestPath = join(extractDir, "manifest.json");
    if (await pathExists(manifestPath)) {
      try {
        manifest = JSON.parse(await readFile(manifestPath, "utf8")) as BackupManifest;
        if (manifest.formatVersion > BACKUP_FORMAT_VERSION) {
          warnings.push(
            `O pacote usa formato ${manifest.formatVersion}; este servidor conhece até ${BACKUP_FORMAT_VERSION}. A restauração pode falhar.`
          );
        }
      } catch {
        warnings.push("Não foi possível ler manifest.json; a continuar com o dump.");
      }
    }

    let envChecklist: BackupEnvChecklistItem[] = buildEnvChecklist();
    const checklistPath = join(extractDir, "env-checklist.json");
    if (await pathExists(checklistPath)) {
      try {
        const fromPackage = JSON.parse(await readFile(checklistPath, "utf8")) as BackupEnvChecklistItem[];
        if (Array.isArray(fromPackage) && fromPackage.length > 0) {
          // Combina: o que o pacote listava vs o que está presente agora no destino.
          const now = new Map(buildEnvChecklist().map((i) => [i.key, i.present]));
          envChecklist = fromPackage.map((item) => ({
            key: item.key,
            present: now.get(item.key) ?? Boolean(process.env[item.key]?.trim())
          }));
        }
      } catch {
        warnings.push("Checklist de variáveis no pacote inválida; a usar a lista do servidor atual.");
      }
    }

    try {
      const { prisma } = await import("@/glpi/config/prisma");
      await prisma.$disconnect();
    } catch {
      // segue mesmo se o disconnect falhar
    }

    const pgWarnings = await runPgRestore(dumpPath);
    warnings.push(...pgWarnings);

    let uploadsRestored = false;
    const uploadsSrc = join(extractDir, "uploads");
    if (options.restoreUploads && (await pathExists(uploadsSrc))) {
      const uploadRoot = uploadRootResolved();
      await mkdir(uploadRoot, { recursive: true });
      await cp(uploadsSrc, uploadRoot, { recursive: true });
      uploadsRestored = true;
    } else if (options.restoreUploads) {
      warnings.push("O pacote não inclui pasta uploads/; anexos não foram restaurados.");
    }

    const missingEnv = envChecklist.filter((i) => !i.present).map((i) => i.key);
    if (missingEnv.length > 0) {
      warnings.push(
        `Variáveis ainda em falta neste servidor (configure no painel do host): ${missingEnv.join(", ")}.`
      );
    }

    return {
      databaseRestored: true,
      uploadsRestored,
      envChecklist,
      manifest,
      warnings
    };
  } finally {
    await rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Grava o corpo de um upload (File/Blob) para ficheiro temporário. */
export async function writeUploadToTempFile(file: File, suffix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gti-backup-upload-"));
  const safeName = basename(file.name || "backup").replace(/[^\w.\-]+/g, "_") || "backup.tar.gz";
  const dest = join(dir, safeName.endsWith(suffix) ? safeName : `${safeName}${suffix}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(dest, buffer);
  return dest;
}
