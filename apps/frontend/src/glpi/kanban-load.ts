import { prisma } from "./config/prisma";
import { getCachedUsersByIds } from "./services/glpi-users-cache.service";
import type { TicketWhereInput } from "./types/ticket-where";
import { buildKanbanWhere, pendenciaLabelForSummary } from "./utils/kanban-filters";
import {
  getOpenTicketOperationalMetrics,
  sumOpenAgeBuckets,
  type OpenAgeBuckets,
  type OpenTicketOperationalMetrics
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

/** Forma do `select` nos `findMany` distintos (tipos explícitos — o pacote `@prisma/client` do frontend nem sempre exporta `Ticket`). */
type DistinctStatusRow = { status: string | null };
type DistinctGroupRow = { contractGroupName: string | null };

/** Linha do `findMany` do quadro Kanban — o tuple do `Promise.all` inferia `any[]` e quebrava `noImplicitAny` no build. */
type KanbanTicketListRow = {
  glpiTicketId: number;
  title: string | null;
  status: string | null;
  contractGroupName: string | null;
  dateCreation: string | null;
  dateModification: string | null;
  waitingParty: string | null;
  updatedAt: Date;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterUserId: number | null;
};

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

export type ChamadosRankRow = { label: string; count: number };

export type ChamadosOldestTicketRow = {
  glpiTicketId: number;
  title: string | null;
  status: string | null;
  contractGroupName: string | null;
  dateCreation: string | null;
  daysOpen: number;
  requesterLabel: string;
};

/** Agregados sobre chamados não fechados com o mesmo filtro do Kanban (`forceNonClosed`). */
export type ChamadosOperationsSummary = {
  openTotal: number;
  agePctOver30: number;
  agePctOver60: number;
  weightedDaysCapped90: number;
  idleGlpiModDays7Plus: number;
  idleGlpiModDays14Plus: number;
  byWaitingParty: ChamadosRankRow[];
  byStatus: ChamadosRankRow[];
  topGroups: ChamadosRankRow[];
  topRequesters: ChamadosRankRow[];
  /** % do total aberto que está nos 3 grupos GLPI (contrato) com mais stock; null se total 0. */
  concentrationTop3GroupsPct: number | null;
  oldestTickets: ChamadosOldestTicketRow[];
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
  operationsSummary: ChamadosOperationsSummary;
};

/**
 * Payload mínimo quando a base ou o cache não estão disponíveis (evita derrubar o Server Component).
 */
function emptyOperationsSummary(): ChamadosOperationsSummary {
  return {
    openTotal: 0,
    agePctOver30: 0,
    agePctOver60: 0,
    weightedDaysCapped90: 0,
    idleGlpiModDays7Plus: 0,
    idleGlpiModDays14Plus: 0,
    byWaitingParty: [],
    byStatus: [],
    topGroups: [],
    topRequesters: [],
    concentrationTop3GroupsPct: null,
    oldestTickets: []
  };
}

function pctOfTotal(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((1000 * part) / total) / 10;
}

function waitingPartyLabel(value: string | null): string {
  switch (value) {
    case "cliente":
      return "Aguardando cliente";
    case "empresa":
      return "Aguardando empresa";
    case "na":
      return "Sem pendência (inferência)";
    case "unknown":
      return "Pendência indefinida";
    default:
      return "Não inferido";
  }
}

async function buildChamadosOperationsSummary(
  whereOpen: TicketWhereInput,
  operational: OpenTicketOperationalMetrics
): Promise<ChamadosOperationsSummary> {
  const b = operational.buckets;
  const openTotal = sumOpenAgeBuckets(b);
  const over30 = b.days30 + b.days60 + b.over60;
  const agePctOver30 = pctOfTotal(over30, openTotal);
  const agePctOver60 = pctOfTotal(b.over60, openTotal);

  const whereNoEmail: TicketWhereInput = {
    AND: [
      whereOpen,
      {
        OR: [{ requesterEmail: null }, { requesterEmail: { equals: "" } }]
      },
      { requesterName: { not: null } },
      { NOT: { requesterName: { equals: "" } } }
    ]
  };

  const [byPartyRows, byStatusRows, byGroupRows, byEmailRows, byNameRows, oldestRaw] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["waitingParty"],
      where: whereOpen,
      _count: { _all: true }
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: whereOpen,
      _count: { _all: true }
    }),
    prisma.ticket.groupBy({
      by: ["contractGroupName"],
      where: whereOpen,
      _count: { _all: true }
    }),
    prisma.ticket.groupBy({
      by: ["requesterEmail"],
      where: whereOpen,
      _count: { _all: true }
    }),
    prisma.ticket.groupBy({
      by: ["requesterName"],
      where: whereNoEmail,
      _count: { _all: true }
    }),
    prisma.ticket.findMany({
      where: whereOpen,
      orderBy: [{ dateCreation: "asc" }, { glpiTicketId: "asc" }],
      take: 12,
      select: {
        glpiTicketId: true,
        title: true,
        status: true,
        contractGroupName: true,
        dateCreation: true,
        requesterName: true,
        requesterEmail: true
      }
    })
  ]);

  const byWaitingParty: ChamadosRankRow[] = byPartyRows
    .map((r) => ({ label: waitingPartyLabel(r.waitingParty), count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  const byStatus: ChamadosRankRow[] = byStatusRows
    .map((r) => ({ label: r.status?.trim() ? r.status! : "Sem status", count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  const topGroups: ChamadosRankRow[] = byGroupRows
    .map((r) => ({
      label: r.contractGroupName?.trim() ? r.contractGroupName! : "Sem grupo (contrato)",
      count: r._count._all
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const reqMap = new Map<string, number>();
  for (const r of byEmailRows) {
    const e = r.requesterEmail?.trim();
    if (!e) continue;
    reqMap.set(e, (reqMap.get(e) ?? 0) + r._count._all);
  }
  for (const r of byNameRows) {
    const n = r.requesterName?.trim();
    if (!n) continue;
    const label = `Solicitante: ${n}`;
    reqMap.set(label, (reqMap.get(label) ?? 0) + r._count._all);
  }
  const topRequesters: ChamadosRankRow[] = Array.from(reqMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const sortedGroupCounts = [...topGroups].sort((a, b) => b.count - a.count);
  const top3Sum = sortedGroupCounts.slice(0, 3).reduce((s, x) => s + x.count, 0);
  const concentrationTop3GroupsPct = openTotal > 0 ? pctOfTotal(top3Sum, openTotal) : null;

  const now = new Date();
  const oldestTickets: ChamadosOldestTicketRow[] = oldestRaw.map((t) => {
    const daysOpen = Math.floor(openDaysApprox(t.dateCreation, now));
    const req =
      [t.requesterName?.trim(), t.requesterEmail?.trim()].filter(Boolean).join(" · ") || "—";
    return {
      glpiTicketId: t.glpiTicketId,
      title: t.title,
      status: t.status,
      contractGroupName: t.contractGroupName,
      dateCreation: t.dateCreation,
      daysOpen: Number.isFinite(daysOpen) ? daysOpen : 0,
      requesterLabel: req
    };
  });

  return {
    openTotal,
    agePctOver30,
    agePctOver60,
    weightedDaysCapped90: operational.weightedDaysCapped90,
    idleGlpiModDays7Plus: operational.idleGlpiModDays7Plus,
    idleGlpiModDays14Plus: operational.idleGlpiModDays14Plus,
    byWaitingParty,
    byStatus,
    topGroups,
    topRequesters,
    concentrationTop3GroupsPct,
    oldestTickets
  };
}

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
    groups: [],
    operationsSummary: emptyOperationsSummary()
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

  const [operationalMetrics, latestTicketRowsRaw, statusRows, groupRows] = await Promise.all([
    getOpenTicketOperationalMetrics(whereAge),
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
  const operationsSummary = await buildChamadosOperationsSummary(whereAge, operationalMetrics);
  const ageBucketsResult = operationalMetrics.buckets;
  const latestTicketRows = latestTicketRowsRaw as KanbanTicketListRow[];

  const statuses = (statusRows as DistinctStatusRow[])
    .map((row) => row.status)
    .filter((s: string | null): s is string => Boolean(s));
  const groups = (groupRows as DistinctGroupRow[])
    .map((row) => row.contractGroupName)
    .filter((g: string | null): g is string => Boolean(g));

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
    groups,
    operationsSummary
  };
}
