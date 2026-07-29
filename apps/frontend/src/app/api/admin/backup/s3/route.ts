import { NextResponse } from "next/server";
import {
  getS3BackupPublicConfig,
  updateS3BackupConfig,
  type S3BackupConfigInput
} from "@/server/admin/s3-backup";
import { jsonBackupError, requireBackupAdmin } from "@/server/admin/require-backup-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_UTF8 = { "content-type": "application/json; charset=utf-8" } as const;

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireBackupAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const config = await getS3BackupPublicConfig();
    return NextResponse.json({ ok: true, ...config }, { status: 200, headers: JSON_UTF8 });
  } catch (e) {
    return jsonBackupError(500, e instanceof Error ? e.message : "Falha ao obter configuração S3.");
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
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
  const input: S3BackupConfigInput = {
    enabled: Boolean(b.enabled),
    bucket: String(b.bucket ?? ""),
    region: String(b.region ?? ""),
    accessKeyId: String(b.accessKeyId ?? ""),
    secretAccessKey: typeof b.secretAccessKey === "string" ? b.secretAccessKey : undefined,
    endpoint: b.endpoint == null || b.endpoint === "" ? null : String(b.endpoint),
    forcePathStyle: b.forcePathStyle === undefined ? true : Boolean(b.forcePathStyle),
    prefix: String(b.prefix ?? "gti/backups"),
    hour: Number(b.hour ?? 3),
    timezone: String(b.timezone ?? "America/Sao_Paulo"),
    keepDaily: Number(b.keepDaily ?? 7),
    keepWeekly: Number(b.keepWeekly ?? 5),
    keepMonthly: Number(b.keepMonthly ?? 12)
  };

  try {
    const config = await updateS3BackupConfig(input);
    return NextResponse.json({ ok: true, ...config }, { status: 200, headers: JSON_UTF8 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao salvar configuração S3.";
    const status = message.includes("Para ativar") || message.includes("Fuso") ? 400 : 500;
    return jsonBackupError(status, message);
  }
}
