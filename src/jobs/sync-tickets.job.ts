import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { normalizeTicket } from "../normalizers/ticket.normalizer";
import { getAllTickets } from "../services/tickets.service";

export async function syncTickets(): Promise<void> {
  logger.info("Iniciando sincronizacao de tickets");

  const rawTickets = await getAllTickets();
  let savedCount = 0;

  for (const rawTicket of rawTickets) {
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
  }

  logger.info({ loaded: rawTickets.length, saved: savedCount }, "Sincronizacao de tickets concluida");
}
