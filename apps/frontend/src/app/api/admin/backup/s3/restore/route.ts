import { NextResponse } from "next/server";
import { restoreS3BackupFromObject } from "@/server/admin/s3-backup";
import { jsonBackupError, requireBackupAdmin } from "@/server/admin/require-backup-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JSON_UTF8 = { "content-type": "application/json; charset=utf-8" } as const;

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireBackupAdmin(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonBackupError(400, "JSON inválido.");
  }
  if (!body || typeof body !== "object") {
    return jsonBackupError(400, "Corpo inválido.");
  }

  const b = body as Record<string, unknown>;
  const objectKey = String(b.objectKey ?? "");
  const confirm = String(b.confirm ?? b.confirmacao ?? "");
  const restoreUploadsRaw = String(b.restoreUploads ?? "true").toLowerCase();
  const restoreUploads =
    restoreUploadsRaw === "1" || restoreUploadsRaw === "true" || restoreUploadsRaw === "on";

  try {
    const result = await restoreS3BackupFromObject({
      objectKey,
      confirmPhrase: confirm,
      restoreUploads
    });
    return NextResponse.json(result, { status: 200, headers: JSON_UTF8 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha na restauração a partir do S3.";
    const status =
      message.includes("Confirmação") ||
      message.includes("incompleto") ||
      message.includes("prefixo") ||
      message.includes("chave")
        ? 400
        : 500;
    return jsonBackupError(status, message);
  }
}
