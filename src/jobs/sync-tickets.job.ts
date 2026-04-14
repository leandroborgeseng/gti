import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { normalizeTicket } from "../normalizers/ticket.normalizer";
import { getAllTickets } from "../services/tickets.service";

export interface SyncTicketsResult {
  loaded: number;
  saved: number;
  failed: number;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function syncTickets(): Promise<SyncTicketsResult> {
  logger.info("Iniciando sincronizacao de tickets");

  const rawTickets = await getAllTickets();
  let savedCount = 0;
  let failedCount = 0;

  for (const rawTicket of rawTickets) {
    try {
      const normalized = normalizeTicket(rawTicket);

      if (!normalized.id) {
        continue;
      }

      await prisma.ticket.upsert({
        where: {
          glpiTicketId: normalized.id
        },
        update: {
          title: normalized.title,
          content: normalized.content,
          status: normalized.status,
          priority: normalized.priority,
          dateCreation: normalized.date_creation,
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
          contractGroupId: normalized.contract_group_id,
          contractGroupName: normalized.contract_group_name,
          rawJson: normalized.raw
        }
      });

      savedCount += 1;
    } catch (error) {
      failedCount += 1;
      logger.warn({ error: toErrorMessage(error) }, "Falha ao salvar ticket individual");
    }
  }

  const result: SyncTicketsResult = {
    loaded: rawTickets.length,
    saved: savedCount,
    failed: failedCount
  };
  logger.info(result, "Sincronizacao de tickets concluida");
  return result;
}
