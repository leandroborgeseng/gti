import { BadRequestException, Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, normalize, resolve } from "node:path";
import { randomUUID } from "node:crypto";

/** MIME permitidos para anexos de medição e glosa. */
const DEFAULT_ALLOWED = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "text/plain"
]);

@Injectable()
export class StorageService {
  readonly root: string;
  private readonly maxBytes: number;
  private readonly allowedMime: Set<string>;

  constructor() {
    this.root = resolve(process.env.UPLOAD_ROOT?.trim() || join(process.cwd(), "uploads"));
    const mb = Number(process.env.UPLOAD_MAX_MB ?? "10");
    this.maxBytes = (Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024;
    const extra = process.env.UPLOAD_EXTRA_MIME?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
    this.allowedMime = new Set([...DEFAULT_ALLOWED, ...extra]);
  }

  getMaxBytes(): number {
    return this.maxBytes;
  }

  assertMimeAllowed(mimeType: string): void {
    const m = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!this.allowedMime.has(m)) {
      throw new BadRequestException(`Tipo de arquivo não permitido: ${mimeType}`);
    }
  }

  assertSize(size: number): void {
    if (size > this.maxBytes) {
      throw new BadRequestException(`Arquivo excede o limite de ${Math.round(this.maxBytes / 1024 / 1024)} MB.`);
    }
  }

  /**
   * Grava o buffer no disco sob `measurements/<measurementId>/` e devolve caminhos para a banco de dados.
   */
  async saveMeasurementFile(
    measurementId: string,
    buffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<{ filePath: string; storedFileName: string }> {
    this.assertMimeAllowed(mimeType);
    this.assertSize(buffer.length);
    const safe = basename(originalName).replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
    const storedFileName = `${randomUUID()}_${safe || "anexo"}`;
    const rel = join("measurements", measurementId, storedFileName).replace(/\\/g, "/");
    const abs = join(this.root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, buffer);
    return { filePath: rel, storedFileName };
  }

  async saveGlosaFile(
    glosaId: string,
    buffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<{ filePath: string; storedFileName: string }> {
    this.assertMimeAllowed(mimeType);
    this.assertSize(buffer.length);
    const safe = basename(originalName).replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
    const storedFileName = `${randomUUID()}_${safe || "anexo"}`;
    const rel = join("glosas", glosaId, storedFileName).replace(/\\/g, "/");
    const abs = join(this.root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, buffer);
    return { filePath: rel, storedFileName };
  }

  async saveProjectTaskFile(
    projectTaskId: string,
    buffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<{ filePath: string; storedFileName: string }> {
    this.assertMimeAllowed(mimeType);
    this.assertSize(buffer.length);
    const safe = basename(originalName).replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
    const storedFileName = `${randomUUID()}_${safe || "anexo"}`;
    const rel = join("project-tasks", projectTaskId, storedFileName).replace(/\\/g, "/");
    const abs = join(this.root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, buffer);
    return { filePath: rel, storedFileName };
  }

  /** Caminho absoluto seguro para leitura (evita path traversal). */
  resolveAbsoluteSafe(relativePath: string): string {
    const normalized = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
    const abs = resolve(join(this.root, normalized));
    const rootResolved = resolve(this.root);
    if (!abs.startsWith(rootResolved)) {
      throw new BadRequestException("Caminho de arquivo inválido.");
    }
    return abs;
  }
}
