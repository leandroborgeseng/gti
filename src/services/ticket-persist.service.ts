import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { flattenAttributes } from "../lib/ticket-attributes-flatten";
import { normalizeTicket } from "../normalizers/ticket.normalizer";
import type { NormalizedTicket } from "../types/glpi.types";
import { enrichNormalizedTicketObservers, enrichNormalizedTicketRequester } from "./glpi-user.service";
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
  raw: unknown
): Promise<PersistNormalizedResult> {
  if (!normalized.id) {
    return "error";
  }

  try {
    const enrichedReq = await enrichNormalizedTicketRequester(normalized);
    const enriched = await enrichNormalizedTicketObservers(enrichedReq);
    const savedTicket = await prisma.ticket.upsert({
      where: {
        glpiTicketId: enriched.id
      },
      update: {
        title: enriched.title,
        content: enriched.content,
        status: enriched.status,
        priority: enriched.priority,
        dateCreation: enriched.date_creation,
        dateModification: enriched.date_modification,
        contractGroupId: enriched.contract_group_id,
        contractGroupName: enriched.contract_group_name,
        requesterName: enriched.requester_name,
        requesterEmail: enriched.requester_email,
        requesterUserId: enriched.requester_user_id,
        rawJson: enriched.raw
      },
      create: {
        glpiTicketId: enriched.id,
        title: enriched.title,
        content: enriched.content,
        status: enriched.status,
        priority: enriched.priority,
        dateCreation: enriched.date_creation,
        dateModification: enriched.date_modification,
        contractGroupId: enriched.contract_group_id,
        contractGroupName: enriched.contract_group_name,
        requesterName: enriched.requester_name,
        requesterEmail: enriched.requester_email,
        requesterUserId: enriched.requester_user_id,
        rawJson: enriched.raw
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
