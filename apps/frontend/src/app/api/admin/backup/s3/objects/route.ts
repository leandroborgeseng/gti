import { NextResponse } from "next/server";
import { listS3BackupObjects } from "@/server/admin/s3-backup";
import { jsonBackupError, requireBackupAdmin } from "@/server/admin/require-backup-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_UTF8 = { "content-type": "application/json; charset=utf-8" } as const;

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireBackupAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const result = await listS3BackupObjects();
    return NextResponse.json({ ok: true, ...result }, { status: 200, headers: JSON_UTF8 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao listar backups no S3.";
    const status = message.includes("incompleto") ? 400 : 500;
    return jsonBackupError(status, message);
  }
}
