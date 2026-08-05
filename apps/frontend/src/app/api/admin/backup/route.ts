import { NextResponse } from "next/server";
import {
  BACKUP_ENV_CHECKLIST_KEYS,
  BACKUP_FORMAT_VERSION,
  BACKUP_RESTORE_CONFIRM_PHRASE,
  backupMaxBytes,
  buildEnvChecklist
} from "@/server/admin/system-backup";
import { requireBackupAdmin } from "@/server/admin/require-backup-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_UTF8 = { "content-type": "application/json; charset=utf-8" } as const;

/**
 * GET /api/admin/backup — metadados e checklist de variáveis (sem valores/segredos).
 */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireBackupAdmin(req);
  if (!auth.ok) return auth.response;

  const envChecklist = buildEnvChecklist();
  const maxMb = Math.floor(backupMaxBytes() / (1024 * 1024));

  return NextResponse.json(
    {
      ok: true,
      formatVersion: BACKUP_FORMAT_VERSION,
      confirmPhrase: BACKUP_RESTORE_CONFIRM_PHRASE,
      maxUploadMb: maxMb,
      envKeysTracked: [...BACKUP_ENV_CHECKLIST_KEYS],
      envChecklist,
      notes: [
        "A exportação gera um .tar.gz com dump PostgreSQL (pg_dump), checklist de variáveis e, opcionalmente, anexos.",
        "Segredos (JWT, senhas GLPI, chaves Resend, etc.) nunca entram no pacote: configure-os no servidor de destino.",
        "A restauração substitui os dados da base atual. Faça-a apenas em manutenção, no servidor de destino."
      ]
    },
    { status: 200, headers: JSON_UTF8 }
  );
}
