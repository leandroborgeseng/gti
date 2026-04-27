import { Injectable, NotFoundException, StreamableFile } from "@nestjs/common";
import { createReadStream, existsSync } from "node:fs";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async downloadFile(id: string): Promise<StreamableFile> {
    const att = await this.prisma.attachment.findUnique({ where: { id } });
    if (!att) {
      throw new NotFoundException("Anexo não encontrado");
    }
    const abs = this.storage.resolveAbsoluteSafe(att.filePath);
    if (!existsSync(abs)) {
      throw new NotFoundException("Arquivo não existe no armazenamento");
    }
    const stream = createReadStream(abs);
    const safeName = att.fileName.replace(/"/g, "'");
    return new StreamableFile(stream, {
      type: att.mimeType,
      disposition: `attachment; filename="${safeName}"`
    });
  }
}
