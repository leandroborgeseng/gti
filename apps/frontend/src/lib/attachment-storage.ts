import { createReadStream, existsSync } from "node:fs";
import { basename, dirname, join, normalize, resolve } from "node:path";

/** Igual ao `StorageService` do Nest (`apps/backend/src/storage/storage.service.ts`). */
export function uploadRootResolved(): string {
  return resolve(process.env.UPLOAD_ROOT?.trim() || join(process.cwd(), "uploads"));
}

export function resolveAttachmentAbsolute(relativePath: string): string {
  const normalized = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = resolve(join(uploadRootResolved(), normalized));
  const rootResolved = resolve(uploadRootResolved());
  if (!abs.startsWith(rootResolved)) {
    throw new Error("INVALID_PATH");
  }
  return abs;
}

export function safeAttachmentFilename(name: string): string {
  return basename(name).replace(/"/g, "'");
}

export { createReadStream, existsSync };
