import { prisma } from "../config/prisma";
import type { TicketWhereInput } from "../types/ticket-where";
import { ticketWhereNotClosed } from "./ticket-status";

export type OpenAgeBuckets = {
  /** Abertos há 0–7 dias (janela de 8 dias inclusiva no cálculo por dias inteiros). */
  week: number;
  /** 8–15 dias. */
  days15: number;
  /** 16–30 dias. */
  days30: number;
  /** 31–60 dias. */
  days60: number;
  /** Mais de 60 dias. */
  over60: number;
  /** Abertos no cache sem data de abertura utilizável. */
  noDate: number;
};

export type OpenAgeBucketKey = keyof OpenAgeBuckets;

const DAY_MS = 86400000;

export function parseOpenAgeBucketParam(raw: string | undefined | null): OpenAgeBucketKey | null {
  const t = (raw ?? "").trim();
  if (t === "week" || t === "days15" || t === "days30" || t === "days60" || t === "over60" || t === "noDate") {
    return t;
  }
  return null;
}

/** Dias inteiros de abertura (piso) ou null se não houver data utilizável. */
export function ticketDaysOpenFloor(dateCreation: string | null | undefined, refMs: number): number | null {
  if (!dateCreation?.trim()) return null;
  const tOpen = Date.parse(dateCreation.trim());
  if (!Number.isFinite(tOpen)) return null;
  const daysOpen = Math.floor((refMs - tOpen) / DAY_MS);
  if (daysOpen < 0) return null;
  return daysOpen;
}

/** Dias desde a última alteração GLPI (ou abertura se inválida), piso — mesma regra das métricas de operação. */
export function ticketIdleDaysFloor(
  dateCreation: string | null | undefined,
  dateModification: string | null | undefined,
  refMs: number
): number | null {
  const tOpenStr = dateCreation?.trim();
  if (!tOpenStr) return null;
  const tOpen = Date.parse(tOpenStr);
  if (!Number.isFinite(tOpen)) return null;
  const tModRaw = dateModification?.trim();
  const tMod = tModRaw ? Date.parse(tModRaw) : NaN;
  const idleStart = Number.isFinite(tMod) ? tMod : tOpen;
  const idleDays = Math.floor((refMs - idleStart) / DAY_MS);
  return Number.isFinite(idleDays) ? idleDays : null;
}

/** Coorte do KPI «% com mais de 30 dias» (soma das faixas 16–30, 31–60 e >60 dias). */
export function ticketInOpsOver30PctCohort(dateCreation: string | null | undefined, refMs: number): boolean {
  const d = ticketDaysOpenFloor(dateCreation, refMs);
  return d != null && d >= 16;
}

/** Coorte do KPI «% com mais de 60 dias» (apenas stock > 60 dias). */
export function ticketInOpsOver60PctCohort(dateCreation: string | null | undefined, refMs: number): boolean {
  const d = ticketDaysOpenFloor(dateCreation, refMs);
  return d != null && d > 60;
}

export function ticketInOpenAgeBucket(
  dateCreation: string | null | undefined,
  refMs: number,
  bucket: OpenAgeBucketKey
): boolean {
  const d = ticketDaysOpenFloor(dateCreation, refMs);
  if (d == null) return bucket === "noDate";
  if (bucket === "week") return d <= 7;
  if (bucket === "days15") return d >= 8 && d <= 15;
  if (bucket === "days30") return d >= 16 && d <= 30;
  if (bucket === "days60") return d >= 31 && d <= 60;
  return d > 60;
}

export type OpenTicketOperationalMetrics = {
  buckets: OpenAgeBuckets;
  /** Somatório de min(dias_abertos, 90) por ticket com data de abertura válida. */
  weightedDaysCapped90: number;
  /** Última alteração no GLPI há ≥ 7 dias (usa `dateModification`; se inválida, usa abertura). */
  idleGlpiModDays7Plus: number;
  /** Idem, ≥ 14 dias. */
  idleGlpiModDays14Plus: number;
};

/**
 * Uma leitura à base: faixas de idade, peso–idade (soma cap 90) e inatividade pela última alteração GLPI.
 * @param filterWhere Critérios adicionais (ex.: mesmo `buildKanbanWhere` com `forceNonClosed: true`).
 */
export async function getOpenTicketOperationalMetrics(filterWhere?: TicketWhereInput): Promise<OpenTicketOperationalMetrics> {
  const where = filterWhere ?? ticketWhereNotClosed();
  const rows = await prisma.ticket.findMany({
    where,
    select: { dateCreation: true, dateModification: true }
  });

  const now = Date.now();
  const buckets: OpenAgeBuckets = {
    week: 0,
    days15: 0,
    days30: 0,
    days60: 0,
    over60: 0,
    noDate: 0
  };
  let weightedDaysCapped90 = 0;
  let idleGlpiModDays7Plus = 0;
  let idleGlpiModDays14Plus = 0;

  for (const row of rows) {
    const daysOpen = ticketDaysOpenFloor(row.dateCreation, now);
    if (daysOpen == null) {
      buckets.noDate += 1;
      continue;
    }

    weightedDaysCapped90 += Math.min(daysOpen, 90);
    if (daysOpen <= 7) {
      buckets.week += 1;
    } else if (daysOpen <= 15) {
      buckets.days15 += 1;
    } else if (daysOpen <= 30) {
      buckets.days30 += 1;
    } else if (daysOpen <= 60) {
      buckets.days60 += 1;
    } else {
      buckets.over60 += 1;
    }

    const idleDays = ticketIdleDaysFloor(row.dateCreation, row.dateModification, now);
    if (idleDays != null && idleDays >= 7) {
      idleGlpiModDays7Plus += 1;
    }
    if (idleDays != null && idleDays >= 14) {
      idleGlpiModDays14Plus += 1;
    }
  }

  return { buckets, weightedDaysCapped90, idleGlpiModDays7Plus, idleGlpiModDays14Plus };
}

/**
 * @param filterWhere Critérios adicionais (ex.: mesmo `buildKanbanWhere` com `forceNonClosed: true`).
 *                    Se omitido, conta todos os abertos no cache.
 */
export async function getOpenTicketAgeBuckets(filterWhere?: TicketWhereInput): Promise<OpenAgeBuckets> {
  const m = await getOpenTicketOperationalMetrics(filterWhere);
  return m.buckets;
}

export function sumOpenAgeBuckets(b: OpenAgeBuckets): number {
  return b.week + b.days15 + b.days30 + b.days60 + b.over60 + b.noDate;
}
