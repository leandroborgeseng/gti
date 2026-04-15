import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateGlosaDto } from "./glosas.dto";

@Injectable()
export class GlosasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateGlosaDto): Promise<unknown> {
    const measurement = await this.prisma.measurement.findFirst({ where: { id: dto.measurementId, deletedAt: null } });
    if (!measurement) throw new NotFoundException("Medição não encontrada");
    const glosa = await this.prisma.glosa.create({
      data: {
        measurementId: dto.measurementId,
        type: dto.type,
        value: new Prisma.Decimal(dto.value),
        justification: dto.justification,
        createdBy: dto.createdBy
      }
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "Glosa",
        entityId: glosa.id,
        action: "CREATE",
        userId: dto.createdBy,
        newData: glosa as unknown as Prisma.InputJsonValue
      }
    });
    return glosa;
  }

  async findAll(): Promise<unknown> {
    return this.prisma.glosa.findMany({
      include: { measurement: { include: { contract: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async addAttachment(glosaId: string, payload: { fileName: string; mimeType: string; filePath: string }): Promise<unknown> {
    const exists = await this.prisma.glosa.findUnique({ where: { id: glosaId } });
    if (!exists) throw new NotFoundException("Glosa não encontrada");
    const attachment = await this.prisma.attachment.create({
      data: {
        glosaId,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        filePath: payload.filePath
      }
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "Attachment",
        entityId: attachment.id,
        action: "CREATE",
        userId: "system",
        newData: attachment as unknown as Prisma.InputJsonValue
      }
    });
    return attachment;
  }
}
