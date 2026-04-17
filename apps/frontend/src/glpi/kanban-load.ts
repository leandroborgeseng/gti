import type { Prisma } from "@prisma/client";
import { prisma } from "./config/prisma";
import { getCachedUsersByIds } from "./services/glpi-users-cache.service";
import { buildKanbanWhere, pendenciaLabelForSummary } from "./utils/kanban-filters";
import {
  getOpenTicketAgeBuckets,
  sumOpenAgeBuckets,
  type OpenAgeBuckets
} from "./utils/open-ticket-aging";

const EMPTY_OPEN_AGE_BUCKETS: OpenAgeBuckets = {
  week: 0,
  days15: 0,
  days30: 0,
  days60: 0,
  over60: 0,
  noDate: 0
};
import { getTicketSyncScope } from "./utils/ticket-sync-scope";
import { mergeColumnOrder, readKanbanSettings, type KanbanSettings } from "./kanban-settings";

const KANBAN_SYNC_STALE_MS = 24 * 60 * 60 * 1000;

type DistinctStatusRow = Prisma.TicketGetPayload<{ select: { status: true } }>;
type DistinctGroupRow = Prisma.TicketGetPayload<{ select: { contractGroupName: true } }>;

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo"
  }).format(date);
}

function formatTicketAge(iso: string | null | undefined, end: Date): string {
  if (!iso) {
    return "—";
  }
  const start = Date.parse(iso);
  if (Number.isNaN(start)) {
    return "—";
  }
  const ms = Math.max(0, end.getTime() - start);
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) {
    return `${days} dia${days === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) {
    return `${hours} h`;
  }
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins} min`;
}

function openDaysApprox(iso: string | null | undefined, ref: Date): number {
  if (!iso) {
    return 0;
  }
  const start = Date.parse(iso);
  if (Number.isNaN(start)) {
    return 0;
  }
  return Math.max(0, (ref.getTime() - start) / 86_400_000);
}

function hashStringToUint32(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function columnChromeStyle(statusKey: string): string {
  const h = 212 + (hashStringToUint32(statusKey) % 20);
  const s = 42 + (hashStringToUint32(`cs:${statusKey}`) % 12);
  const l = 89 + (hashStringToUint32(`cl:${statusKey}`) % 5);
  const bg = `hsl(${h} ${s}% ${l}%)`;
  const borderL = Math.max(l - 20, 52);
  const border = `hsl(${h} ${Math.min(s + 14, 56)}% ${borderL}%)`;
  return `--col-bg:${bg};--col-border:${border};--col-heading:#0c1929;--col-muted:rgba(12,25,41,0.62);`;
}

function cardHeatChromeStyle(daysOpen: number): string {
  const maxDays = 90;
  const t = Math.min(1, Math.max(0, daysOpen / maxDays));
  const mix = (a: [number, number, number], b: [number, number, number]) =>
    a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const bg = mix([167, 243, 208], [254, 202, 202]);
  const bd = mix([21, 128, 61], [185, 28, 28]);
  return `background:rgb(${bg[0]},${bg[1]},${bg[2]});border:3px solid rgb(${bd[0]},${bd[1]},${bd[2]});box-shadow:0 2px 12px rgba(${bd[0]},${bd[1]},${bd[2]},0.3);`;
}

function kanbanCardSyncTooltipText(dateMod: string | null, updatedAt: Date, syncStale: boolean): string {
  const base = `GLPI ${formatDateTime(dateMod)} · Sync ${formatDateTime(updatedAt)}`;
  return syncStale ? `${base}. Última gravação no cache há mais de 24 h.` : `${base}. Cache sincronizado nas últimas 24 h.`;
}

export type KanbanCardDto = {
  glpiTicketId: number;
  title: string | null;
  status: string | null;
  contractGroupName: string | null;
  pendLabel: string;
  pendClass: string;
  requesterName: string;
  requesterEmail: string;
  openFor: string;
  idleFor: string;
  syncStale: boolean;
  syncTip: string;
  cardStyle: string;
};

export type KanbanBoardPayload = {
  q: string;
  statusFilter: string;
  groupFilter: string;
  onlyOpen: boolean;
  pendenciaParam: string;
  pendenciaSummary: string;
  filteredTotal: number;
  ticketSyncScope: "open" | "all";
  kanbanSettings: KanbanSettings;
  orderedStatusKeys: string[];
  columns: Array<{ statusKey: string; count: number; columnStyle: string; cards: KanbanCardDto[] }>;
  ageBuckets: OpenAgeBuckets;
  ageTotal: number;
  statuses: string[];
  groups: string[];
};

/**
 * Payload mínimo quando a base ou o cache não estão disponíveis (evita derrubar o Server Component).
 */
export function buildFallbackKanbanBoardPayload(searchParams: URLSearchParams): KanbanBoardPayload {
  const q = (searchParams.get("q") || "").trim();
  const statusFilter = (searchParams.get("status") || "").trim();
  const groupFilter = (searchParams.get("group") || "").trim();
  const onlyOpen = searchParams.get("open") === "1";
  const pendenciaParam = (searchParams.get("pendencia") || "").trim();
  return {
    q,
    statusFilter,
    groupFilter,
    onlyOpen,
    pendenciaParam,
    pendenciaSummary: pendenciaLabelForSummary(pendenciaParam),
    filteredTotal: 0,
    ticketSyncScope: "open",
    kanbanSettings: {},
    orderedStatusKeys: [],
    columns: [],
    ageBuckets: EMPTY_OPEN_AGE_BUCKETS,
    ageTotal: 0,
    statuses: [],
    groups: []
  };
}

export async function loadKanbanBoardPayload(searchParams: URLSearchParams): Promise<KanbanBoardPayload> {
  const q = (searchParams.get("q") || "").trim();
  const statusFilter = (searchParams.get("status") || "").trim();
  const groupFilter = (searchParams.get("group") || "").trim();
  const onlyOpen = searchParams.get("open") === "1";
  const pendenciaParam = (searchParams.get("pendencia") || "").trim();

  const where = buildKanbanWhere({ q, statusFilter, groupFilter, onlyOpen, pendenciaParam });
  const whereAge = buildKanbanWhere({
    q,
    statusFilter,
    groupFilter,
    onlyOpen,
    pendenciaParam,
    forceNonClosed: true
  });

  const [totalFiltered, kanbanStored, scope] = await Promise.all([
    prisma.ticket.count({ where }),
    readKanbanSettings(),
    getTicketSyncScope()
  ]);

  const [ageBucketsResult, latestTicketRows, statusRows, groupRows] = await Promise.all([
    getOpenTicketAgeBuckets(whereAge),
    prisma.ticket.findMany({
      where,
      orderBy: [{ dateCreation: "asc" }, { glpiTicketId: "asc" }],
      take: 200,
      select: {
        glpiTicketId: true,
        title: true,
        status: true,
        contractGroupName: true,
        dateCreation: true,
        dateModification: true,
        waitingParty: true,
        updatedAt: true,
        requesterName: true,
        requesterEmail: true,
        requesterUserId: true
      }
    }),
    prisma.ticket.findMany({
      where: { status: { not: null } },
      distinct: ["status"],
      select: { status: true },
      orderBy: { status: "asc" }
    }),
    prisma.ticket.findMany({
      where: { contractGroupName: { not: null } },
      distinct: ["contractGroupName"],
      select: { contractGroupName: true },
      orderBy: { contractGroupName: "asc" }
    })
  ]);

  const statuses = statusRows.map((row: DistinctStatusRow) => row.status).filter((s): s is string => Boolean(s));
  const groups = groupRows.map((row: DistinctGroupRow) => row.contractGroupName).filter((g): g is string => Boolean(g));

  const requesterIds = latestTicketRows
    .map((t) => t.requesterUserId)
    .filter((id): id is number => typeof id === "number" && id > 0);
  const requesterFallbackById = await getCachedUsersByIds(requesterIds).catch(() => new Map());

  const ticketsByStatus = new Map<string, typeof latestTicketRows>();
  for (const ticket of latestTicketRows) {
    const key = ticket.status || "Sem status";
    const existing = ticketsByStatus.get(key) || [];
    existing.push(ticket);
    ticketsByStatus.set(key, existing);
  }
  const compareTicketsInColumn = (
    a: { glpiTicketId: number; dateCreation: string | null; dateModification: string | null },
    b: { glpiTicketId: number; dateCreation: string | null; dateModification: string | null }
  ): number => {
    const da = Date.parse(a.dateCreation || "") || Date.parse(a.dateModification || "") || 0;
    const db = Date.parse(b.dateCreation || "") || Date.parse(b.dateModification || "") || 0;
    if (da !== db) {
      return da - db;
    }
    return a.glpiTicketId - b.glpiTicketId;
  };
  for (const arr of ticketsByStatus.values()) {
    arr.sort(compareTicketsInColumn);
  }

  const discoveredStatusKeys = Array.from(new Set([...statuses, ...Array.from(ticketsByStatus.keys())]));
  const orderedStatusKeys = mergeColumnOrder(kanbanStored.columnOrder, discoveredStatusKeys);
  const now = new Date();

  const buildColumnInlineStyle = (statusKey: string): string => {
    const override = kanbanStored.columnColors?.[statusKey];
    if (override) {
      return `--col-bg:${override};--col-border:hsl(218 42% 58%);--col-heading:#0c1929;--col-muted:rgba(12,25,41,0.62);`;
    }
    return columnChromeStyle(statusKey);
  };

  const columns = orderedStatusKeys.map((statusKey) => {
    const cardsRaw = ticketsByStatus.get(statusKey) || [];
    const columnStyle = buildColumnInlineStyle(statusKey);
    const cards: KanbanCardDto[] = cardsRaw.map((ticket) => {
      const reqFromCache = ticket.requesterUserId ? requesterFallbackById.get(ticket.requesterUserId) : null;
      const reqName = ticket.requesterName ?? reqFromCache?.displayName ?? null;
      const reqEmail = ticket.requesterEmail ?? reqFromCache?.email ?? null;
      const pendLabel =
        ticket.waitingParty === "cliente"
          ? "Aguardando cliente"
          : ticket.waitingParty === "empresa"
            ? "Aguardando empresa"
            : ticket.waitingParty === "na"
              ? "Sem pendencia"
              : ticket.waitingParty === "unknown"
                ? "Pendencia ?"
                : "Pendencia nao calculada";
      const pendClass =
        ticket.waitingParty === "cliente" ||
        ticket.waitingParty === "empresa" ||
        ticket.waitingParty === "na" ||
        ticket.waitingParty === "unknown"
          ? ticket.waitingParty
          : "none";
      const updAt = ticket.updatedAt instanceof Date ? ticket.updatedAt : new Date(ticket.updatedAt);
      const syncAgeMs = now.getTime() - updAt.getTime();
      const syncStale = !Number.isFinite(syncAgeMs) || syncAgeMs > KANBAN_SYNC_STALE_MS;
      const daysOpen = openDaysApprox(ticket.dateCreation, now);
      return {
        glpiTicketId: ticket.glpiTicketId,
        title: ticket.title,
        status: ticket.status,
        contractGroupName: ticket.contractGroupName,
        pendLabel,
        pendClass,
        requesterName: reqName || "—",
        requesterEmail: reqEmail || "",
        openFor: formatTicketAge(ticket.dateCreation, now),
        idleFor: formatTicketAge(ticket.dateModification || ticket.dateCreation, now),
        syncStale,
        syncTip: kanbanCardSyncTooltipText(ticket.dateModification, updAt, syncStale),
        cardStyle: cardHeatChromeStyle(daysOpen)
      };
    });
    return { statusKey, count: cards.length, columnStyle, cards };
  });

  return {
    q,
    statusFilter,
    groupFilter,
    onlyOpen,
    pendenciaParam,
    pendenciaSummary: pendenciaLabelForSummary(pendenciaParam),
    filteredTotal: totalFiltered,
    ticketSyncScope: scope,
    kanbanSettings: kanbanStored,
    orderedStatusKeys,
    columns,
    ageBuckets: ageBucketsResult,
    ageTotal: sumOpenAgeBuckets(ageBucketsResult),
    statuses,
    groups
  };
}
