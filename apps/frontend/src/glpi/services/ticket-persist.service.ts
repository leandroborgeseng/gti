import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { flattenAttributes } from "../lib/ticket-attributes-flatten";
import { normalizeTicket } from "../normalizers/ticket.normalizer";
import type { NormalizedTicket } from "../types/glpi.types";
import type { RequesterContact } from "../utils/ticket-requester";
import { getTicketSyncScope } from "../utils/ticket-sync-scope";
import { isTicketClosedStatus } from "../utils/ticket-status";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export type PersistNormalizedResult = "saved" | "error";

export async function persistNormalizedTicket(
  normalized: NormalizedTicket,
  raw: unknown,
  requesterFallback?: RequesterContact | null
): Promise<PersistNormalizedResult> {
  if (!normalized.id) {
    return "error";
  }

  try {
    const requesterName = normalized.requester_name ?? requesterFallback?.displayName ?? null;
    const requesterEmail = normalized.requester_email ?? requesterFallback?.email ?? null;
    const requesterUserId = normalized.requester_user_id ?? requesterFallback?.userId ?? null;
    /** Sem chamadas GET /User por ticket na sync: usa fallback do cache local de usuários ativos (quando disponível). */
    const savedTicket = await prisma.ticket.upsert({
      where: {
        glpiTicketId: normalized.id
      },
      update: {
        title: normalized.title,
        content: normalized.content,
        status: normalized.status,
        priority: normalized.priority,
        dateCreation: normalized.date_creation,
        dateModification: normalized.date_modification,
        contractGroupId: normalized.contract_group_id,
        contractGroupName: normalized.contract_group_name,
        requesterName,
        requesterEmail,
        requesterUserId,
        assignedUserId: normalized.assigned_user_id ?? null,
        assignedUserName: normalized.assigned_user_name ?? null,
        rawJson: normalized.raw
      },
      create: {
        glpiTicketId: normalized.id,
        title: normalized.title,
        content: normalized.content,
        status: normalized.status,
        priority: normalized.priority,
        dateCreation: normalized.date_creation,
        dateModification: normalized.date_modification,
        contractGroupId: normalized.contract_group_id,
        contractGroupName: normalized.contract_group_name,
        requesterName,
        requesterEmail,
        requesterUserId,
        assignedUserId: normalized.assigned_user_id ?? null,
        assignedUserName: normalized.assigned_user_name ?? null,
        rawJson: normalized.raw
      },
      select: {
        id: true
      }
    });

    const flattened = flattenAttributes(raw);
    await prisma.ticketAttribute.deleteMany({
      where: { ticketId: savedTicket.id }
    });
    if (flattened.length > 0) {
      await prisma.ticketAttribute.createMany({
        data: flattened.map((item) => ({
          ticketId: savedTicket.id,
          keyPath: item.keyPath.slice(0, 500),
          valueType: item.valueType.slice(0, 50),
          valueText: item.valueText,
          valueJson: item.valueJson
        }))
      });
    }

    return "saved";
  } catch (error) {
    logger.warn({ error: toErrorMessage(error), glpiTicketId: normalized.id }, "Falha ao salvar ticket individual");
    return "error";
  }
}

/** Atualiza ou remove do cache local conforme status e escopo de sync (`ticket_sync_scope`). */
export async function persistTicketFromRaw(raw: unknown): Promise<void> {
  const normalized = normalizeTicket(raw);
  if (!normalized.id) {
    throw new Error("Ticket sem id no payload GLPI");
  }

  if (isTicketClosedStatus(normalized.status)) {
    const scope = await getTicketSyncScope();
    if (scope === "open") {
      await prisma.ticket.deleteMany({ where: { glpiTicketId: normalized.id } });
      return;
    }
    const closedResult = await persistNormalizedTicket(normalized, raw);
    if (closedResult === "error") {
      throw new Error(`Falha ao persistir ticket fechado ${normalized.id}`);
    }
    return;
  }

  const result = await persistNormalizedTicket(normalized, raw);
  if (result === "error") {
    throw new Error(`Falha ao persistir ticket ${normalized.id}`);
  }
}
