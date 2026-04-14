import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { flattenAttributes } from "../lib/ticket-attributes-flatten";
import { normalizeTicket } from "../normalizers/ticket.normalizer";
import type { NormalizedTicket } from "../types/glpi.types";
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

/** Atualiza ou remove do cache local conforme status (fechados não ficam no SQLite). */
export async function persistTicketFromRaw(raw: unknown): Promise<void> {
  const normalized = normalizeTicket(raw);
  if (!normalized.id) {
    throw new Error("Ticket sem id no payload GLPI");
  }

  if (isTicketClosedStatus(normalized.status)) {
    await prisma.ticket.deleteMany({ where: { glpiTicketId: normalized.id } });
    return;
  }

  const result = await persistNormalizedTicket(normalized, raw);
  if (result === "error") {
    throw new Error(`Falha ao persistir ticket ${normalized.id}`);
  }
}
