import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import {
  cleanupBackupPaths,
  createSystemBackup,
  buildEnvChecklist
} from "@/server/admin/system-backup";
import { jsonBackupError, requireBackupAdmin } from "@/server/admin/require-backup-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Exportação completa pode demorar em bases grandes (Coolify/Railway). */
export const maxDuration = 300;

/**
 * GET /api/admin/backup/export?uploads=1
 * Descarrega pacote .tar.gz (dump PostgreSQL + checklist de env + anexos opcionais).
 */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireBackupAdmin(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const includeUploads =
    url.searchParams.get("uploads") === "1" ||
    url.searchParams.get("uploads") === "true" ||
    url.searchParams.get("includeUploads") === "1";

  let archivePath = "";
  let workDir = "";

  try {
    const result = await createSystemBackup({ includeUploads });
    archivePath = result.archivePath;
    workDir = result.workDir;

    const fileStat = await stat(archivePath);
    const nodeStream = createReadStream(archivePath);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

    // Limpa ficheiros temporários depois do stream terminar (ou falhar).
    const cleanup = () => {
      void cleanupBackupPaths(archivePath, workDir);
    };
    nodeStream.on("close", cleanup);
    nodeStream.on("error", cleanup);

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(fileStat.size),
        "Cache-Control": "no-store",
        "X-GTI-Backup-Include-Uploads": result.manifest.includeUploads ? "1" : "0"
      }
    });
  } catch (e) {
    await cleanupBackupPaths(archivePath, workDir);
    const message = e instanceof Error ? e.message : "Falha ao gerar o backup.";
    return jsonBackupError(500, message);
  }
}

/**
 * HEAD /api/admin/backup/export — diagnóstico rápido (checklist de env no servidor atual).
 */
export async function HEAD(req: Request): Promise<NextResponse> {
  const auth = await requireBackupAdmin(req);
  if (!auth.ok) return auth.response;
  const checklist = buildEnvChecklist();
  const missing = checklist.filter((i) => !i.present).length;
  return new NextResponse(null, {
    status: 200,
    headers: {
      "X-GTI-Env-Defined": String(checklist.length - missing),
      "X-GTI-Env-Missing": String(missing),
      "Cache-Control": "no-store"
    }
  });
}
