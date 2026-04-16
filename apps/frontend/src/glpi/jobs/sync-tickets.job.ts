import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { normalizeTicket } from "../normalizers/ticket.normalizer";
import { ensureActiveUsersCacheFresh, getCachedUsersByIds } from "../services/glpi-users-cache.service";
import { persistNormalizedTicket } from "../services/ticket-persist.service";
import { getTicketsPage, type TicketsPageResult } from "../services/tickets.service";
import type { RequesterContact } from "../utils/ticket-requester";
import { getTicketSyncScope } from "../utils/ticket-sync-scope";
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
  /** Páginas GLPI a buscar em paralelo (prefetch). */
  fetchConcurrency?: number;
  onProgress?: (progress: SyncProgress) => void;
}

function parseIsoDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function syncTickets(options: SyncTicketsOptions = {}): Promise<SyncTicketsResult> {
  await ensureActiveUsersCacheFresh().catch((error) => {
    logger.warn({ error: String(error) }, "Cache de usuários ativos indisponível; sync segue sem fallback de nome");
  });
  const syncScope = await getTicketSyncScope();
  logger.info(
    { syncScope },
    syncScope === "all"
      ? "Iniciando sincronizacao de tickets (cache completo: abertos e fechados)"
      : "Iniciando sincronizacao de tickets (apenas abertos no cache local)"
  );

  const pageSize = options.pageSize ?? env.GLPI_TICKETS_PAGE_SIZE;
  const fetchConcurrency = options.fetchConcurrency ?? env.GLPI_TICKETS_FETCH_CONCURRENCY;
  const onProgress = options.onProgress;
  let page = 1;
  let loadedCount = 0;
  let savedCount = 0;
  let failedCount = 0;
  let maxDateMod = "";
  let maxDateCreation = "";
  const cursorState = await prisma.syncState.findUnique({ where: { key: "last_sync_date_mod" } });
  const previousCursor = cursorState?.value || null;

  const ticketPages = new Map<number, Promise<TicketsPageResult>>();

  function ensurePageScheduled(p: number): void {
    if (p < 1 || ticketPages.has(p)) {
      return;
    }
    ticketPages.set(p, getTicketsPage(p, pageSize));
  }

  logger.info({ pageSize, fetchConcurrency }, "Sincronizacao GLPI: tamanho de pagina e paralelismo");

  if (syncScope === "open") {
    const removedClosed = await prisma.ticket.deleteMany({ where: ticketWhereClosed() });
    if (removedClosed.count > 0) {
      logger.info({ count: removedClosed.count }, "Removidos do cache tickets com status fechado");
    }
  }

  for (let i = 1; i <= fetchConcurrency; i += 1) {
    ensurePageScheduled(i);
  }

  while (true) {
    const { tickets: rawTickets, remoteTotal } = await ticketPages.get(page)!;
    ticketPages.delete(page);
    loadedCount += rawTickets.length;
    let reachedAlreadySyncedWindow = false;
    const normalizedPage = rawTickets.map((r) => normalizeTicket(r));
    const requesterIds = normalizedPage.map((n) => n.requester_user_id).filter((id): id is number => typeof id === "number" && id > 0);
    const requesterFallbackMap = await getCachedUsersByIds(requesterIds).catch(() => new Map<number, RequesterContact>());

    if (remoteTotal !== undefined) {
      await prisma.syncState.upsert({
        where: { key: "glpi_ticket_total" },
        update: { value: String(remoteTotal) },
        create: { key: "glpi_ticket_total", value: String(remoteTotal) }
      });
    }

    for (let i = 0; i < rawTickets.length; i += 1) {
      const rawTicket = rawTickets[i];
      const normalized = normalizedPage[i];
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
        if (syncScope === "open") {
          await prisma.ticket.deleteMany({ where: { glpiTicketId: normalized.id } });
          continue;
        }
        const persistClosed = await persistNormalizedTicket(
          normalized,
          rawTicket,
          normalized.requester_user_id ? requesterFallbackMap.get(normalized.requester_user_id) ?? null : null
        );
        if (persistClosed === "saved") {
          savedCount += 1;
        } else {
          failedCount += 1;
        }
        continue;
      }

      const persistResult = await persistNormalizedTicket(
        normalized,
        rawTicket,
        normalized.requester_user_id ? requesterFallbackMap.get(normalized.requester_user_id) ?? null : null
      );
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
    ensurePageScheduled(page + fetchConcurrency - 1);
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
