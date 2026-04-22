import { prisma } from "./config/prisma";
import { getCachedUsersByIds } from "./services/glpi-users-cache.service";
import type { TicketWhereInput } from "./types/ticket-where";
import {
  buildKanbanWhere,
  buildKanbanWhereClosed,
  pendenciaLabelForSummary,
  parseOpsCohortParam,
  type KanbanFilterInput
} from "./utils/kanban-filters";
import { narrowTicketWhereByComputedOpts } from "./utils/kanban-narrow-computed";
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
  assignedUserId: number | null;
  assignedUserName: string | null;
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
  /** Rótulo do técnico atribuído (GLPI), quando existir no cache. */
  assigneeLabel: string | null;
  openFor: string;
  idleFor: string;
  syncStale: boolean;
  syncTip: string;
  cardStyle: string;
};

export type ChamadosRankRow = {
  label: string;
  count: number;
  /** Mescla na query do quadro para filtrar como esta linha (chaves vazias removem o parâmetro). */
  filterHrefPatch?: Record<string, string | undefined>;
};

export type ChamadosOldestTicketRow = {
  glpiTicketId: number;
  title: string | null;
  status: string | null;
  contractGroupName: string | null;
  dateCreation: string | null;
  daysOpen: number;
  requesterLabel: string;
};

/** Um mês civil (America/Sao_Paulo) para o gráfico de aberturas; `month` = `YYYY-MM` para ordenação. */
export type ChamadosOpeningsByMonth = { month: string; label: string; count: number };

const SP_TZ = "America/Sao_Paulo";
const spYearMonthFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SP_TZ,
  year: "numeric",
  month: "2-digit"
});

function parseTicketDateCreation(raw: string | null): Date | null {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();
  let t = Date.parse(s);
  if (!Number.isFinite(t) && s.includes(" ") && !s.includes("T")) {
    t = Date.parse(s.replace(" ", "T"));
  }
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

function spYearMonthFromDate(d: Date): string {
  return spYearMonthFmt.format(d);
}

function ymAddOne(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
  if (m >= 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function monthRangeInclusive(startYm: string, endYm: string): string[] {
  if (startYm > endYm) return [];
  const out: string[] = [];
  let cur = startYm;
  let guard = 0;
  while (cur <= endYm && guard < 120) {
    out.push(cur);
    cur = ymAddOne(cur);
    guard += 1;
  }
  return out;
}

function labelForYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ym;
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(y, m - 1, 15)));
}

function monthlyBarsFromCounts(counts: Map<string, number>): ChamadosOpeningsByMonth[] {
  if (counts.size === 0) return [];
  const sortedKeys = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
  const startYm = sortedKeys[0]!;
  const nowYm = spYearMonthFromDate(new Date());
  const lastDataYm = sortedKeys[sortedKeys.length - 1]!;
  const endYm = lastDataYm > nowYm ? lastDataYm : nowYm;
  const full = monthRangeInclusive(startYm, endYm);
  return full.map((month) => ({
    month,
    label: labelForYm(month),
    count: counts.get(month) ?? 0
  }));
}

function buildOpeningsByMonthFromRows(rows: { dateCreation: string | null }[]): ChamadosOpeningsByMonth[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const d = parseTicketDateCreation(r.dateCreation);
    if (!d) continue;
    const ym = spYearMonthFromDate(d);
    counts.set(ym, (counts.get(ym) ?? 0) + 1);
  }
  return monthlyBarsFromCounts(counts);
}

/** Fechamentos por mês + acumulado no período (proxy de mês: última alteração GLPI, senão abertura). */
export type ChamadosClosingsByMonth = {
  month: string;
  label: string;
  count: number;
  cumulative: number;
};

function buildClosingsByMonthFromRows(
  rows: { dateModification: string | null; dateCreation: string | null }[]
): ChamadosClosingsByMonth[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const d =
      parseTicketDateCreation(r.dateModification) ?? parseTicketDateCreation(r.dateCreation);
    if (!d) continue;
    const ym = spYearMonthFromDate(d);
    counts.set(ym, (counts.get(ym) ?? 0) + 1);
  }
  const bars = monthlyBarsFromCounts(counts);
  let cumulative = 0;
  return bars.map((row) => {
    cumulative += row.count;
    return { ...row, cumulative };
  });
}

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
  /** Abertos por técnico atribuído no cache (`assignedUserId`); linha sem técnico pode existir sem link de filtro. */
  topAssignees: ChamadosRankRow[];
  /** % do total aberto que está nos 3 grupos GLPI (contrato) com mais stock; null se total 0. */
  concentrationTop3GroupsPct: number | null;
  /** Nomes de `contractGroupName` dos 3 grupos com mais stock (`""` = sem grupo), para filtro «concentração». */
  concentrationTop3GroupNames: string[];
  oldestTickets: ChamadosOldestTicketRow[];
  /** Aberturas por mês (fuso São Paulo), stock actual com os mesmos filtros. */
  openingsByMonth: ChamadosOpeningsByMonth[];
  /** Fechados no cache (mesmos filtros), por mês + acumulado no período. */
  closingsByMonth: ChamadosClosingsByMonth[];
};

export type KanbanBoardPayload = {
  q: string;
  statusFilter: string;
  groupFilter: string;
  requesterEmail: string;
  requesterName: string;
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
  /** Eco da URL / estado derivado para o formulário e links. */
  cohortParam: string;
  idleMin: string;
  groupInJson: string;
  groupNull: boolean;
  /** ID GLPI do técnico atribuído (`users_id_tech`); `null` = todos. */
  assignedUserId: number | null;
  /** Opções para o filtro «Atribuído» (distintos no cache). */
  assignedUsers: Array<{ id: number; label: string }>;
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
    topAssignees: [],
    concentrationTop3GroupsPct: null,
    concentrationTop3GroupNames: [],
    oldestTickets: [],
    openingsByMonth: [],
    closingsByMonth: []
  };
}

function pctOfTotal(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((1000 * part) / total) / 10;
}

function parseGroupInJsonParam(raw: string): string[] | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  try {
    const v = JSON.parse(t) as unknown;
    if (!Array.isArray(v) || v.length === 0) return undefined;
    return v.map((x) => String(x));
  } catch {
    return undefined;
  }
}

function parseIdleMinParam(raw: string): number | undefined {
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return n;
}

function pendenciaParamFromWaitingParty(raw: string | null): string {
  if (raw == null || raw === "") return "nao_inferido";
  if (raw === "cliente") return "cliente";
  if (raw === "empresa") return "empresa";
  if (raw === "na") return "na";
  if (raw === "unknown") return "desconhecido";
  return "nao_inferido";
}

function requesterPatchFromTopRequesterLabel(label: string): { requesterEmail?: string; requesterName?: string } {
  const t = label.trim();
  if (t.includes("@")) return { requesterEmail: t, requesterName: "" };
  const p = "Solicitante: ";
  if (t.startsWith(p)) {
    const name = t.slice(p.length).trim();
    return { requesterEmail: "", requesterName: name };
  }
  return {};
}

const OPS_TABLE_LINK_PATCH: Record<string, string | undefined> = {
  open: "1",
  cohort: "",
  idleMin: "",
  groupInJson: "",
  groupNull: "",
  assignedUserId: ""
};

function readChamadosFilterParts(sp: URLSearchParams): {
  q: string;
  statusFilter: string;
  groupFilter: string;
  requesterEmail: string;
  requesterName: string;
  onlyOpenRaw: boolean;
  pendenciaParam: string;
  cohortParam: string;
  idleMinRaw: string;
  groupInJson: string;
  groupNull: boolean;
  assignedUserId: number | undefined;
  cohort: ReturnType<typeof parseOpsCohortParam>;
  idleMinDays: number | undefined;
  groupInNames: string[] | undefined;
  onlyOpenEffective: boolean;
  filterBase: KanbanFilterInput;
} {
  const q = (sp.get("q") || "").trim();
  const statusFilter = (sp.get("status") || "").trim();
  const groupFilter = (sp.get("group") || "").trim();
  const requesterEmail = (sp.get("requesterEmail") || "").trim();
  const requesterName = (sp.get("requesterName") || "").trim();
  const assignedUserIdRaw = (sp.get("assignedUserId") || "").trim();
  const assignedParsed = assignedUserIdRaw ? Number.parseInt(assignedUserIdRaw, 10) : NaN;
  const assignedUserId =
    Number.isFinite(assignedParsed) && assignedParsed > 0 ? assignedParsed : undefined;
  const onlyOpenRaw = sp.get("open") === "1";
  const pendenciaParam = (sp.get("pendencia") || "").trim();
  const cohortParam = (sp.get("cohort") || "").trim();
  const idleMinRaw = (sp.get("idleMin") || "").trim();
  const groupInJson = (sp.get("groupInJson") || "").trim();
  const groupNull = sp.get("groupNull") === "1";
  const cohort = parseOpsCohortParam(cohortParam);
  const idleMinDays = parseIdleMinParam(idleMinRaw);
  const groupInNames = parseGroupInJsonParam(groupInJson);
  const drillSlice = Boolean(
    cohort ||
      idleMinDays ||
      (groupInNames && groupInNames.length > 0) ||
      (groupNull && !(groupInNames && groupInNames.length > 0))
  );
  const onlyOpenEffective = onlyOpenRaw || drillSlice;

  const filterBase: KanbanFilterInput = {
    q,
    statusFilter,
    groupFilter,
    onlyOpen: onlyOpenEffective,
    pendenciaParam,
    requesterEmail,
    requesterName,
    ...(assignedUserId !== undefined ? { assignedUserId } : {}),
    groupInNames: groupInNames && groupInNames.length > 0 ? groupInNames : undefined,
    groupNullOnly:
      groupInNames && groupInNames.length > 0 ? undefined : groupNull ? true : undefined
  };

  return {
    q,
    statusFilter,
    groupFilter,
    requesterEmail,
    requesterName,
    assignedUserId,
    onlyOpenRaw,
    pendenciaParam,
    cohortParam,
    idleMinRaw,
    groupInJson,
    groupNull,
    cohort,
    idleMinDays,
    groupInNames,
    onlyOpenEffective,
    filterBase
  };
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
  whereClosed: TicketWhereInput,
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

  const [byPartyRows, byStatusRows, byGroupRows, byAssigneeRows, byEmailRows, byNameRows, oldestRaw, openingsRows, closingsRows] =
    await Promise.all([
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
      by: ["assignedUserId"],
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
    }),
    prisma.ticket.findMany({
      where: whereOpen,
      select: { dateCreation: true }
    }),
    prisma.ticket.findMany({
      where: whereClosed,
      select: { dateModification: true, dateCreation: true }
    })
  ]);

  const openingsByMonth = buildOpeningsByMonthFromRows(openingsRows);
  const closingsByMonth = buildClosingsByMonthFromRows(closingsRows);

  const byWaitingParty: ChamadosRankRow[] = byPartyRows
    .map((r) => ({
      label: waitingPartyLabel(r.waitingParty),
      count: r._count._all,
      filterHrefPatch: {
        ...OPS_TABLE_LINK_PATCH,
        pendencia: pendenciaParamFromWaitingParty(r.waitingParty)
      }
    }))
    .sort((a, b) => b.count - a.count);

  const byStatus: ChamadosRankRow[] = byStatusRows
    .map((r) => ({
      label: r.status?.trim() ? r.status! : "Sem status",
      count: r._count._all,
      filterHrefPatch: {
        ...OPS_TABLE_LINK_PATCH,
        status: r.status?.trim() ? r.status! : "__NULL__"
      }
    }))
    .sort((a, b) => b.count - a.count);

  const topGroups: ChamadosRankRow[] = byGroupRows
    .map((r) => {
      const label = r.contractGroupName?.trim() ? r.contractGroupName! : "Sem grupo (contrato)";
      const filterHrefPatch = r.contractGroupName?.trim()
        ? { ...OPS_TABLE_LINK_PATCH, group: r.contractGroupName.trim(), groupNull: "" }
        : { ...OPS_TABLE_LINK_PATCH, group: "", groupNull: "1" };
      return { label, count: r._count._all, filterHrefPatch };
    })
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
    .map(([label, count]) => {
      const req = requesterPatchFromTopRequesterLabel(label);
      const has = Boolean(req.requesterEmail || req.requesterName);
      return {
        label,
        count,
        filterHrefPatch: has
          ? {
              ...OPS_TABLE_LINK_PATCH,
              requesterEmail: req.requesterEmail ?? "",
              requesterName: req.requesterName ?? ""
            }
          : undefined
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const assigneeIds = byAssigneeRows
    .map((r) => r.assignedUserId)
    .filter((id): id is number => typeof id === "number" && id > 0);
  const assigneeNameRows =
    assigneeIds.length > 0
      ? await prisma.ticket.findMany({
          where: { assignedUserId: { in: assigneeIds } },
          distinct: ["assignedUserId"],
          select: { assignedUserId: true, assignedUserName: true }
        })
      : [];
  const assigneeNameById = new Map<number, string>(
    assigneeNameRows
      .filter((r) => r.assignedUserId != null && r.assignedUserId > 0)
      .map((r) => [
        r.assignedUserId as number,
        r.assignedUserName?.trim() || `Utilizador #${r.assignedUserId}`
      ])
  );

  const topAssignees: ChamadosRankRow[] = byAssigneeRows
    .map((r) => {
      const id = r.assignedUserId;
      const count = r._count._all;
      if (id == null || id <= 0) {
        return {
          label: "Sem técnico atribuído (cache)",
          count,
          filterHrefPatch: undefined
        };
      }
      const label = assigneeNameById.get(id) ?? `Utilizador #${id}`;
      return {
        label,
        count,
        filterHrefPatch: {
          ...OPS_TABLE_LINK_PATCH,
          assignedUserId: String(id)
        }
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const byGroupForConc = [...byGroupRows].sort((a, b) => b._count._all - a._count._all);
  const top3GroupsForConc = byGroupForConc.slice(0, 3);
  const concentrationTop3GroupNames = top3GroupsForConc.map((r) =>
    r.contractGroupName?.trim() ? r.contractGroupName.trim() : ""
  );
  const top3Sum = top3GroupsForConc.reduce((s, x) => s + x._count._all, 0);
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
    topAssignees,
    concentrationTop3GroupsPct,
    concentrationTop3GroupNames,
    oldestTickets,
    openingsByMonth,
    closingsByMonth
  };
}

export function buildFallbackKanbanBoardPayload(searchParams: URLSearchParams): KanbanBoardPayload {
  const p = readChamadosFilterParts(searchParams);
  return {
    q: p.q,
    statusFilter: p.statusFilter,
    groupFilter: p.groupFilter,
    requesterEmail: p.requesterEmail,
    requesterName: p.requesterName,
    onlyOpen: p.onlyOpenEffective,
    pendenciaParam: p.pendenciaParam,
    pendenciaSummary: pendenciaLabelForSummary(p.pendenciaParam),
    filteredTotal: 0,
    ticketSyncScope: "all",
    kanbanSettings: {},
    orderedStatusKeys: [],
    columns: [],
    ageBuckets: EMPTY_OPEN_AGE_BUCKETS,
    ageTotal: 0,
    statuses: [],
    groups: [],
    operationsSummary: emptyOperationsSummary(),
    cohortParam: p.cohortParam,
    idleMin: p.idleMinRaw,
    groupInJson: p.groupInJson,
    groupNull: p.groupNull,
    assignedUserId: p.assignedUserId ?? null,
    assignedUsers: []
  };
}

export async function loadKanbanBoardPayload(searchParams: URLSearchParams): Promise<KanbanBoardPayload> {
  const p = readChamadosFilterParts(searchParams);
  const { q, statusFilter, groupFilter, requesterEmail, requesterName, pendenciaParam, filterBase } = p;

  const narrowOpts = {
    cohort: p.cohort ?? undefined,
    idleMinDays: p.idleMinDays
  };

  let where = buildKanbanWhere(filterBase);
  where = await narrowTicketWhereByComputedOpts(where, narrowOpts);

  let whereAge = buildKanbanWhere({ ...filterBase, forceNonClosed: true });
  whereAge = await narrowTicketWhereByComputedOpts(whereAge, narrowOpts);

  const whereClosed = buildKanbanWhereClosed(filterBase);

  const [totalFiltered, kanbanStored, scope] = await Promise.all([
    prisma.ticket.count({ where }),
    readKanbanSettings(),
    getTicketSyncScope()
  ]);

  const [operationalMetrics, latestTicketRowsRaw, statusRows, groupRows, assigneeRowsRaw] = await Promise.all([
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
        requesterUserId: true,
        assignedUserId: true,
        assignedUserName: true
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
    }),
    prisma.ticket.findMany({
      where: { assignedUserId: { not: null } },
      distinct: ["assignedUserId"],
      select: { assignedUserId: true, assignedUserName: true },
      orderBy: { assignedUserName: "asc" },
      take: 200
    })
  ]);
  const operationsSummary = await buildChamadosOperationsSummary(whereAge, whereClosed, operationalMetrics);
  const ageBucketsResult = operationalMetrics.buckets;
  const latestTicketRows = latestTicketRowsRaw as KanbanTicketListRow[];

  const assignedUsers = (assigneeRowsRaw as { assignedUserId: number | null; assignedUserName: string | null }[])
    .filter((r): r is { assignedUserId: number; assignedUserName: string | null } => r.assignedUserId != null && r.assignedUserId > 0)
    .map((r) => ({
      id: r.assignedUserId,
      label: r.assignedUserName?.trim() || `Utilizador #${r.assignedUserId}`
    }));

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
      const aid = ticket.assignedUserId;
      const assigneeLabel =
        aid != null && aid > 0 ? ticket.assignedUserName?.trim() || `Utilizador #${aid}` : null;
      return {
        glpiTicketId: ticket.glpiTicketId,
        title: ticket.title,
        status: ticket.status,
        contractGroupName: ticket.contractGroupName,
        pendLabel,
        pendClass,
        requesterName: reqName || "—",
        requesterEmail: reqEmail || "",
        assigneeLabel,
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
    requesterEmail,
    requesterName,
    onlyOpen: p.onlyOpenEffective,
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
    operationsSummary,
    cohortParam: p.cohortParam,
    idleMin: p.idleMinRaw,
    groupInJson: p.groupInJson,
    groupNull: p.groupNull,
    assignedUserId: p.assignedUserId ?? null,
    assignedUsers
  };
}
