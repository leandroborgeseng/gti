import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { normalizeTicket } from "../normalizers/ticket.normalizer";
import { persistNormalizedTicket } from "../services/ticket-persist.service";
import { getTicketsPage } from "../services/tickets.service";
import { isTicketClosedStatus, ticketWhereClosed } from "../utils/ticket-status";

export interface SyncTicketsResult {
  loaded: number;
  saved: number;
  failed: number;
}

export interface SyncProgress extends SyncTicketsResult {
  page: number;
}

interface SyncTicketsOptions {
  pageSize?: number;
  onProgress?: (progress: SyncProgress) => void;
}

function parseIsoDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function syncTickets(options: SyncTicketsOptions = {}): Promise<SyncTicketsResult> {
  logger.info("Iniciando sincronizacao de tickets (apenas abertos no cache local)");

  const pageSize = options.pageSize ?? 100;
  const onProgress = options.onProgress;
  let page = 1;
  let loadedCount = 0;
  let savedCount = 0;
  let failedCount = 0;
  let maxDateMod = "";
  let maxDateCreation = "";
  const cursorState = await prisma.syncState.findUnique({ where: { key: "last_sync_date_mod" } });
  const previousCursor = cursorState?.value || null;

  const removedClosed = await prisma.ticket.deleteMany({ where: ticketWhereClosed() });
  if (removedClosed.count > 0) {
    logger.info({ count: removedClosed.count }, "Removidos do cache tickets com status fechado");
  }

  while (true) {
    const { tickets: rawTickets, remoteTotal } = await getTicketsPage(page, pageSize);
    loadedCount += rawTickets.length;
    let reachedAlreadySyncedWindow = false;

    if (remoteTotal !== undefined) {
      await prisma.syncState.upsert({
        where: { key: "glpi_ticket_total" },
        update: { value: String(remoteTotal) },
        create: { key: "glpi_ticket_total", value: String(remoteTotal) }
      });
    }

    for (const rawTicket of rawTickets) {
      const normalized = normalizeTicket(rawTicket);
      const normalizedDateMod = normalized.date_modification ?? normalized.date_creation;
      const currentDateMs = parseIsoDate(normalizedDateMod);
      const previousDateMs = parseIsoDate(previousCursor);
      if (previousCursor && currentDateMs !== null && previousDateMs !== null && currentDateMs <= previousDateMs) {
        reachedAlreadySyncedWindow = true;
      }

      if (!normalized.id) {
        continue;
      }

      if (normalized.date_modification && (!maxDateMod || normalized.date_modification > maxDateMod)) {
        maxDateMod = normalized.date_modification;
      }
      if (normalized.date_creation && (!maxDateCreation || normalized.date_creation > maxDateCreation)) {
        maxDateCreation = normalized.date_creation;
      }

      if (isTicketClosedStatus(normalized.status)) {
        await prisma.ticket.deleteMany({ where: { glpiTicketId: normalized.id } });
        continue;
      }

      const persistResult = await persistNormalizedTicket(normalized, rawTicket);
      if (persistResult === "saved") {
        savedCount += 1;
      } else {
        failedCount += 1;
      }
    }

    onProgress?.({
      page,
      loaded: loadedCount,
      saved: savedCount,
      failed: failedCount
    });

    if (rawTickets.length < pageSize) {
      break;
    }
    void reachedAlreadySyncedWindow;

    page += 1;
  }

  const newCursor = maxDateMod || maxDateCreation || previousCursor || new Date().toISOString();
  await prisma.syncState.upsert({
    where: { key: "last_sync_date_mod" },
    update: { value: newCursor },
    create: { key: "last_sync_date_mod", value: newCursor }
  });

  const result: SyncTicketsResult = {
    loaded: loadedCount,
    saved: savedCount,
    failed: failedCount
  };
  logger.info(result, "Sincronizacao de tickets concluida");
  return result;
}
