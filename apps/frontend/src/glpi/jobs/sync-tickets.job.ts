import { performance } from "node:perf_hooks";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { normalizeTicket } from "../normalizers/ticket.normalizer";
import type { NormalizedTicket } from "../types/glpi.types";
import { ensureActiveUsersCacheFresh, getCachedUsersByIds } from "../services/glpi-users-cache.service";
import { backfillAssignedUserFromCachedRaw, persistNormalizedTicket } from "../services/ticket-persist.service";
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

/**
 * - `inherit`: comportamento clássico segundo `getTicketSyncScope()` (open = só abertos e apaga fechados; all = tudo).
 * - `open`: só persiste não-fechados; **não** remove fechados já no cache (cron frequente com escopo «todos»).
 * - `closed`: só persiste fechados (cron diário com escopo «todos»).
 */
export type SyncTicketsPersistFilter = "inherit" | "open" | "closed";

interface SyncTicketsOptions {
  pageSize?: number;
  /** Páginas GLPI a buscar em paralelo (prefetch). */
  fetchConcurrency?: number;
  /** Tickets por página a persistir em paralelo na BD (sobrepor env). */
  persistConcurrency?: number;
  onProgress?: (progress: SyncProgress) => void;
  persistFilter?: SyncTicketsPersistFilter;
}

type PersistTask = {
  normalized: NormalizedTicket;
  raw: unknown;
  requesterFallback: RequesterContact | null | undefined;
};

function parseIsoDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function roundMs(ms: number): number {
  return Math.round(ms * 10) / 10;
}

export async function syncTickets(options: SyncTicketsOptions = {}): Promise<SyncTicketsResult> {
  await ensureActiveUsersCacheFresh().catch((error) => {
    logger.warn({ error: String(error) }, "Cache de usuários ativos indisponível; sync segue sem fallback de nome");
  });
  const backfillAssigned = await backfillAssignedUserFromCachedRaw({ limit: 200 }).catch((e) => {
    logger.warn({ err: String(e) }, "Backfill de técnico a partir do rawJson falhou; sync segue");
    return { scanned: 0, updated: 0 };
  });
  if (backfillAssigned.updated > 0) {
    logger.info({ ...backfillAssigned }, "Backfill: técnico atribuído a partir de rawJson em cache (sem re-fetch GLPI)");
  }
  const syncScope = await getTicketSyncScope();
  const persistFilter: SyncTicketsPersistFilter = options.persistFilter ?? "inherit";
  logger.info(
    { syncScope, persistFilter },
    persistFilter === "closed"
      ? "Iniciando sincronizacao de tickets (apenas fechados — passagem estatistica)"
      : persistFilter === "open"
        ? "Iniciando sincronizacao de tickets (apenas abertos — cache hibrido)"
        : syncScope === "all"
          ? "Iniciando sincronizacao de tickets (cache completo: abertos e fechados)"
          : "Iniciando sincronizacao de tickets (apenas abertos no cache local)"
  );

  const pageSize = options.pageSize ?? env.GLPI_TICKETS_PAGE_SIZE;
  const fetchConcurrency = options.fetchConcurrency ?? env.GLPI_TICKETS_FETCH_CONCURRENCY;
  const persistConcurrency = options.persistConcurrency ?? env.GLPI_SYNC_PERSIST_CONCURRENCY;
  const onProgress = options.onProgress;
  let page = 1;
  let loadedCount = 0;
  let savedCount = 0;
  let failedCount = 0;
  let maxDateMod = "";
  let maxDateCreation = "";
  const cursorState = await prisma.syncState.findUnique({ where: { key: "last_sync_date_mod" } });
  const previousCursor = cursorState?.value || null;

  /** Total de tickets no GLPI (última resposta ou `glpi_ticket_total` na BD) — evita parar na 1.ª página se `limit < pageSize`. */
  const totalHintRow = await prisma.syncState.findUnique({ where: { key: "glpi_ticket_total" } });
  let lastRemoteTotal: number | undefined;
  if (totalHintRow?.value) {
    const n = Number(String(totalHintRow.value).trim());
    if (Number.isFinite(n) && n > 0) {
      lastRemoteTotal = n;
    }
  }

  const ticketPages = new Map<number, Promise<TicketsPageResult>>();

  function ensurePageScheduled(p: number): void {
    if (p < 1 || ticketPages.has(p)) {
      return;
    }
    ticketPages.set(p, getTicketsPage(p, pageSize));
  }

  logger.info(
    { pageSize, fetchConcurrency, persistConcurrency },
    "Sincronizacao GLPI: tamanho de pagina, prefetch GLPI e persistencia na BD"
  );

  const deleteAllClosedAtStart = persistFilter === "inherit" && syncScope === "open";
  if (deleteAllClosedAtStart) {
    const removedClosed = await prisma.ticket.deleteMany({ where: ticketWhereClosed() });
    if (removedClosed.count > 0) {
      logger.info({ count: removedClosed.count }, "Removidos do cache tickets com status fechado");
    }
  }

  for (let i = 1; i <= fetchConcurrency; i += 1) {
    ensurePageScheduled(i);
  }

  let totalFetchMs = 0;
  let totalPrepMs = 0;
  let totalDbStateMs = 0;
  let totalDeleteClosedMs = 0;
  let totalPersistMs = 0;
  let pagesDone = 0;

  let winFetchMs = 0;
  let winPrepMs = 0;
  let winDbStateMs = 0;
  let winDeleteClosedMs = 0;
  let winPersistMs = 0;
  let winPages = 0;
  let loadedAtWindowStart = 0;
  const metricsEvery = env.GLPI_SYNC_METRICS_LOG_EVERY;

  while (true) {
    const tPage0 = performance.now();
    const tFetch0 = performance.now();
    const { tickets: rawTickets, remoteTotal } = await ticketPages.get(page)!;
    const fetchMs = performance.now() - tFetch0;
    ticketPages.delete(page);
    loadedCount += rawTickets.length;
    let reachedAlreadySyncedWindow = false;

    const tPrep0 = performance.now();
    const normalizedPage = rawTickets.map((r) => normalizeTicket(r));
    const requesterIds = normalizedPage.map((n) => n.requester_user_id).filter((id): id is number => typeof id === "number" && id > 0);
    const assigneeIds = normalizedPage
      .map((n) => n.assigned_user_id)
      .filter((id): id is number => typeof id === "number" && id > 0);
    const allUserIds = [...new Set([...requesterIds, ...assigneeIds])];
    const userFallbackMap = await getCachedUsersByIds(allUserIds).catch(() => new Map<number, RequesterContact>());
    for (const n of normalizedPage) {
      if (n.assigned_user_id && n.assigned_user_id > 0) {
        const c = userFallbackMap.get(n.assigned_user_id);
        if (c?.displayName) {
          n.assigned_user_name = c.displayName;
        }
      }
    }
    const requesterFallbackMap = userFallbackMap;
    const prepMs = performance.now() - tPrep0;

    let dbStateMs = 0;
    if (remoteTotal !== undefined && Number.isFinite(remoteTotal) && remoteTotal > 0) {
      lastRemoteTotal = remoteTotal;
      const tDb0 = performance.now();
      await prisma.syncState.upsert({
        where: { key: "glpi_ticket_total" },
        update: { value: String(remoteTotal) },
        create: { key: "glpi_ticket_total", value: String(remoteTotal) }
      });
      dbStateMs = performance.now() - tDb0;
    }

    const openScopeClosedIds: number[] = [];
    const persistQueue: PersistTask[] = [];

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

      const fb =
        normalized.requester_user_id != null
          ? (requesterFallbackMap.get(normalized.requester_user_id) ?? null)
          : null;

      if (isTicketClosedStatus(normalized.status)) {
        const persistClosed =
          persistFilter === "closed" || (persistFilter === "inherit" && syncScope === "all");
        if (persistClosed) {
          persistQueue.push({ normalized, raw: rawTicket, requesterFallback: fb });
        } else if (persistFilter === "inherit" && syncScope === "open") {
          openScopeClosedIds.push(normalized.id);
        }
        continue;
      }

      const persistOpen = persistFilter !== "closed";
      if (persistOpen) {
        persistQueue.push({ normalized, raw: rawTicket, requesterFallback: fb });
      }
    }

    let deleteClosedMs = 0;
    if (persistFilter === "inherit" && syncScope === "open" && openScopeClosedIds.length > 0) {
      const uniqueClosed = [...new Set(openScopeClosedIds)];
      const tDel0 = performance.now();
      await prisma.ticket.deleteMany({ where: { glpiTicketId: { in: uniqueClosed } } });
      deleteClosedMs = performance.now() - tDel0;
    }

    let persistMs = 0;
    const chunk = Math.max(1, persistConcurrency);
    for (let c = 0; c < persistQueue.length; c += chunk) {
      const slice = persistQueue.slice(c, c + chunk);
      const tPer0 = performance.now();
      const outcomes = await Promise.all(
        slice.map((t) => persistNormalizedTicket(t.normalized, t.raw, t.requesterFallback))
      );
      persistMs += performance.now() - tPer0;
      for (const o of outcomes) {
        if (o === "saved") {
          savedCount += 1;
        } else {
          failedCount += 1;
        }
      }
    }

    const pageWallMs = performance.now() - tPage0;
    totalFetchMs += fetchMs;
    totalPrepMs += prepMs;
    totalDbStateMs += dbStateMs;
    totalDeleteClosedMs += deleteClosedMs;
    totalPersistMs += persistMs;
    pagesDone += 1;

    winFetchMs += fetchMs;
    winPrepMs += prepMs;
    winDbStateMs += dbStateMs;
    winDeleteClosedMs += deleteClosedMs;
    winPersistMs += persistMs;
    winPages += 1;

    logger.info(
      {
        etapa: "sync_tickets_pagina",
        page,
        ticketsNaPagina: rawTickets.length,
        remoteTotal: lastRemoteTotal,
        /** Espera pela Promise da página (HTTP GLPI já disparada pelo prefetch). */
        fetchMs: roundMs(fetchMs),
        /** Normalização + cache de requerentes. */
        prepMs: roundMs(prepMs),
        /** Upsert do total de tickets em `SyncState`. */
        dbStateMs: roundMs(dbStateMs),
        /** `deleteMany` de fechados no escopo `open`. */
        deleteClosedMs: roundMs(deleteClosedMs),
        /** Upserts Prisma por fatias (`persistNormalizedTicket`). */
        persistMs: roundMs(persistMs),
        pageWallMs: roundMs(pageWallMs),
        acumulado: {
          loaded: loadedCount,
          pages: pagesDone,
          mediaFetchPorPagina: pagesDone ? roundMs(totalFetchMs / pagesDone) : 0,
          mediaPersistPorPagina: pagesDone ? roundMs(totalPersistMs / pagesDone) : 0
        }
      },
      "Sync tickets: metricas da pagina (fetch=GLPI/rede; persist=Prisma)"
    );

    if (metricsEvery > 0 && loadedCount - loadedAtWindowStart >= metricsEvery) {
      const ticketsNoBloco = loadedCount - loadedAtWindowStart;
      logger.info(
        {
          etapa: "sync_tickets_janela",
          ticketsNoBloco,
          desdeLoaded: loadedAtWindowStart,
          ateLoaded: loadedCount,
          paginasNoBloco: winPages,
          fetchMs: roundMs(winFetchMs),
          prepMs: roundMs(winPrepMs),
          dbStateMs: roundMs(winDbStateMs),
          deleteClosedMs: roundMs(winDeleteClosedMs),
          persistMs: roundMs(winPersistMs),
          msPorTicketCarregado: ticketsNoBloco > 0 ? roundMs((winFetchMs + winPrepMs + winDbStateMs + winDeleteClosedMs + winPersistMs) / ticketsNoBloco) : 0,
          parteFetch: ticketsNoBloco > 0 ? roundMs(winFetchMs / ticketsNoBloco) : 0,
          partePersist: ticketsNoBloco > 0 ? roundMs(winPersistMs / ticketsNoBloco) : 0
        },
        "Sync tickets: janela agregada (diagnostico de gargalo)"
      );
      loadedAtWindowStart = loadedCount;
      winFetchMs = 0;
      winPrepMs = 0;
      winDbStateMs = 0;
      winDeleteClosedMs = 0;
      winPersistMs = 0;
      winPages = 0;
    }

    onProgress?.({
      page,
      loaded: loadedCount,
      saved: savedCount,
      failed: failedCount
    });

    if (page >= env.GLPI_SYNC_MAX_PAGES) {
      logger.warn(
        { page, maxPages: env.GLPI_SYNC_MAX_PAGES, loadedCount, lastRemoteTotal },
        "Sync tickets: limite GLPI_SYNC_MAX_PAGES atingido (aumente a env se necessário)"
      );
      break;
    }

    if (rawTickets.length === 0) {
      break;
    }

    if (lastRemoteTotal !== undefined && loadedCount >= lastRemoteTotal) {
      break;
    }

    if (rawTickets.length < pageSize && lastRemoteTotal !== undefined) {
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
  logger.info(
    {
      ...result,
      etapa: "sync_tickets_resumo_metricas",
      paginas: pagesDone,
      totalFetchMs: roundMs(totalFetchMs),
      totalPrepMs: roundMs(totalPrepMs),
      totalDbStateMs: roundMs(totalDbStateMs),
      totalDeleteClosedMs: roundMs(totalDeleteClosedMs),
      totalPersistMs: roundMs(totalPersistMs),
      totalWallEstimadoMs: roundMs(totalFetchMs + totalPrepMs + totalDbStateMs + totalDeleteClosedMs + totalPersistMs),
      mediaMsPorTicket:
        loadedCount > 0
          ? roundMs((totalFetchMs + totalPrepMs + totalDbStateMs + totalDeleteClosedMs + totalPersistMs) / loadedCount)
          : 0
    },
    "Sincronizacao de tickets concluida (metricas: fetch=GLPI/rede; persist e demais=BD)"
  );
  return result;
}
