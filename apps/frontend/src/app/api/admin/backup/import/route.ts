import { NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { rm } from "node:fs/promises";
import {
  BACKUP_RESTORE_CONFIRM_PHRASE,
  backupMaxBytes,
  restoreSystemBackup,
  writeUploadToTempFile
} from "@/server/admin/system-backup";
import { jsonBackupError, requireBackupAdmin } from "@/server/admin/require-backup-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JSON_UTF8 = { "content-type": "application/json; charset=utf-8" } as const;

/**
 * POST /api/admin/backup/import
 * multipart/form-data: file, confirm (= RESTAURAR), restoreUploads (= true|false)
 */
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireBackupAdmin(req);
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonBackupError(400, "Corpo da pedido inválido (esperado multipart/form-data).");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonBackupError(400, "Envie o ficheiro de backup no campo «file».");
  }

  const maxBytes = backupMaxBytes();
  if (file.size <= 0) {
    return jsonBackupError(400, "Ficheiro de backup vazio.");
  }
  if (file.size > maxBytes) {
    const maxMb = Math.floor(maxBytes / (1024 * 1024));
    return jsonBackupError(
      400,
      `Ficheiro demasiado grande (máx. ${maxMb} MB). Ajuste BACKUP_MAX_MB no servidor se necessário.`
    );
  }

  const confirm = String(form.get("confirm") ?? "");
  const restoreUploadsRaw = String(form.get("restoreUploads") ?? "true").toLowerCase();
  const restoreUploads = restoreUploadsRaw === "1" || restoreUploadsRaw === "true" || restoreUploadsRaw === "on";

  const name = (file.name || "").toLowerCase();
  if (
    !name.endsWith(".tar.gz") &&
    !name.endsWith(".tgz") &&
    !name.endsWith(".dump") &&
    !name.endsWith(".gti-backup")
  ) {
    return jsonBackupError(
      400,
      "Extensão não suportada. Use o .tar.gz gerado pela exportação (ou um .dump PostgreSQL)."
    );
  }

  let tempPath = "";
  try {
    tempPath = await writeUploadToTempFile(file, name.endsWith(".dump") ? ".dump" : ".tar.gz");
    const result = await restoreSystemBackup({
      archivePath: tempPath,
      restoreUploads,
      confirmPhrase: confirm
    });

    return NextResponse.json(
      {
        ok: true,
        message:
          "Restauração concluída. Valide o login e as variáveis de ambiente no novo servidor. Pode ser necessário voltar a autenticar-se.",
        databaseRestored: result.databaseRestored,
        uploadsRestored: result.uploadsRestored,
        envChecklist: result.envChecklist,
        warnings: result.warnings,
        confirmPhraseRequired: BACKUP_RESTORE_CONFIRM_PHRASE
      },
      { status: 200, headers: JSON_UTF8 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha na restauração.";
    const status = message.includes("Confirmação inválida") ? 400 : 500;
    return jsonBackupError(status, message);
  } finally {
    if (tempPath) {
      const dir = dirname(tempPath);
      await unlink(tempPath).catch(() => undefined);
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
