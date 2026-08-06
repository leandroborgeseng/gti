import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { getAuditActorId } from "../../common/audit-actor";
import { resolveAuditGate } from "../../common/audit-event-gate";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateNotificationTemplateDto, UpdateNotificationTemplateDto } from "./notification-templates.dto";

export const MAIL_MERGE_FIELDS = [
  "{{contrato.codigoInterno}}",
  "{{contrato.nome}}",
  "{{contrato.numeroFormal}}",
  "{{contrato.cnpj}}",
  "{{empresa.nome}}",
  "{{orgao.nome}}",
  "{{notificacao.numero}}",
  "{{notificacao.assunto}}",
  "{{notificacao.prazoResposta}}",
  "{{notificacao.prazoCiencia}}",
  "{{data.hoje}}"
] as const;

@Injectable()
export class NotificationTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  mailMergeFields() {
    return [...MAIL_MERGE_FIELDS];
  }

  async findAll(includeInactive = false) {
    return this.prisma.notificationTemplate.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.notificationTemplate.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: "desc" }, take: 20 } }
    });
    if (!row) throw new NotFoundException("Modelo de notificação não encontrado.");
    return row;
  }

  async create(dto: CreateNotificationTemplateDto) {
    const created = await this.prisma.notificationTemplate.create({
      data: {
        name: dto.name.trim(),
        documentTitle: dto.documentTitle.trim(),
        emailSubject: dto.emailSubject.trim(),
        purpose: dto.purpose ?? "OUTRO",
        notificationType: dto.notificationType ?? "NOTIFICACAO_FORMAL",
        severity: dto.severity ?? "INFORMATIVA",
        defaultResponseDays: dto.defaultResponseDays ?? 5,
        requiresAck: dto.requiresAck ?? true,
        requiresResponse: dto.requiresResponse ?? false,
        requiresSchedule: dto.requiresSchedule ?? false,
        requiresActionPlan: dto.requiresActionPlan ?? false,
        reviewFlow: dto.reviewFlow?.trim() || null,
        bodyHtml: dto.bodyHtml,
        headerHtml: dto.headerHtml ?? null,
        footerHtml: dto.footerHtml ?? null,
        mailMergeFields: [...MAIL_MERGE_FIELDS],
        version: 1,
        active: true
      }
    });
    await this.audit("NotificationTemplate", created.id, "CREATE", null, created);
    return created;
  }

  async update(id: string, dto: UpdateNotificationTemplateDto) {
    const prev = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException("Modelo de notificação não encontrado.");

    const usedCount = await this.prisma.contractNotification.count({ where: { templateId: id } });
    const contentChanging =
      (dto.bodyHtml !== undefined && dto.bodyHtml !== prev.bodyHtml) ||
      (dto.headerHtml !== undefined && dto.headerHtml !== prev.headerHtml) ||
      (dto.footerHtml !== undefined && dto.footerHtml !== prev.footerHtml) ||
      (dto.documentTitle !== undefined && dto.documentTitle !== prev.documentTitle) ||
      (dto.emailSubject !== undefined && dto.emailSubject !== prev.emailSubject);

    const nextVersion = usedCount > 0 && contentChanging ? prev.version + 1 : prev.version;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (usedCount > 0 && contentChanging) {
        await tx.notificationTemplateVersion.create({
          data: {
            templateId: id,
            version: prev.version,
            snapshot: {
              name: prev.name,
              documentTitle: prev.documentTitle,
              emailSubject: prev.emailSubject,
              purpose: prev.purpose,
              notificationType: prev.notificationType,
              severity: prev.severity,
              defaultResponseDays: prev.defaultResponseDays,
              requiresAck: prev.requiresAck,
              requiresResponse: prev.requiresResponse,
              requiresSchedule: prev.requiresSchedule,
              requiresActionPlan: prev.requiresActionPlan,
              reviewFlow: prev.reviewFlow,
              bodyHtml: prev.bodyHtml,
              headerHtml: prev.headerHtml,
              footerHtml: prev.footerHtml,
              version: prev.version
            } as Prisma.InputJsonValue
          }
        });
      }
      return tx.notificationTemplate.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          documentTitle: dto.documentTitle?.trim(),
          emailSubject: dto.emailSubject?.trim(),
          purpose: dto.purpose,
          notificationType: dto.notificationType,
          severity: dto.severity,
          defaultResponseDays: dto.defaultResponseDays,
          requiresAck: dto.requiresAck,
          requiresResponse: dto.requiresResponse,
          requiresSchedule: dto.requiresSchedule,
          requiresActionPlan: dto.requiresActionPlan,
          reviewFlow: dto.reviewFlow === undefined ? undefined : dto.reviewFlow?.trim() || null,
          active: dto.active,
          bodyHtml: dto.bodyHtml,
          headerHtml: dto.headerHtml === undefined ? undefined : dto.headerHtml,
          footerHtml: dto.footerHtml === undefined ? undefined : dto.footerHtml,
          version: nextVersion
        }
      });
    });

    await this.audit("NotificationTemplate", id, "UPDATE", prev, updated);
    return updated;
  }

  async deactivate(id: string) {
    const prev = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException("Modelo de notificação não encontrado.");
    if (!prev.active) return prev;
    const updated = await this.prisma.notificationTemplate.update({
      where: { id },
      data: { active: false }
    });
    await this.audit("NotificationTemplate", id, "UPDATE", prev, updated);
    return updated;
  }

  /** Exclusão bloqueada se já usado — use inativar. */
  async remove(id: string) {
    const used = await this.prisma.contractNotification.count({ where: { templateId: id } });
    if (used > 0) {
      throw new BadRequestException(
        "Este modelo já foi usado em notificações. Em vez de excluir, inative-o."
      );
    }
    const prev = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException("Modelo de notificação não encontrado.");
    await this.prisma.notificationTemplate.delete({ where: { id } });
    await this.audit("NotificationTemplate", id, "DELETE", prev, null);
    return { ok: true };
  }

  private async audit(entity: string, entityId: string, action: string, oldData: unknown, newData: unknown) {
    const gate = await resolveAuditGate(this.prisma, entity, action);
    if (!gate.enabled) return;
    await this.prisma.auditLog.create({
      data: {
        entity,
        entityId,
        action,
        userId: getAuditActorId(),
        oldData: gate.detailLevel === "ACTION_ONLY" ? undefined : (oldData as Prisma.InputJsonValue),
        newData: gate.detailLevel === "ACTION_ONLY" ? undefined : (newData as Prisma.InputJsonValue)
      }
    });
  }
}
