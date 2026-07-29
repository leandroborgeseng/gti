import { NextResponse } from "next/server";
import { runS3BackupNow } from "@/server/admin/s3-backup";
import { jsonBackupError, requireBackupAdmin } from "@/server/admin/require-backup-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JSON_UTF8 = { "content-type": "application/json; charset=utf-8" } as const;

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireBackupAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const lastRun = await runS3BackupNow();
    return NextResponse.json({ ok: true, lastRun }, { status: 200, headers: JSON_UTF8 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao executar backup S3.";
    const status =
      message.includes("desabilitado") ||
      message.includes("incompleto") ||
      message.includes("andamento")
        ? 400
        : 500;
    return jsonBackupError(status, message);
  }
}
