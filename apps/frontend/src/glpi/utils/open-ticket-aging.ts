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

const DAY_MS = 86400000;

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
    if (!row.dateCreation || !row.dateCreation.trim()) {
      buckets.noDate += 1;
      continue;
    }
    const tOpen = Date.parse(row.dateCreation);
    if (!Number.isFinite(tOpen)) {
      buckets.noDate += 1;
      continue;
    }
    const daysOpen = Math.floor((now - tOpen) / DAY_MS);
    if (daysOpen < 0) {
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

    const tModRaw = row.dateModification?.trim();
    const tMod = tModRaw ? Date.parse(tModRaw) : NaN;
    const idleStart = Number.isFinite(tMod) ? tMod : tOpen;
    const idleDays = Math.floor((now - idleStart) / DAY_MS);
    if (Number.isFinite(idleDays) && idleDays >= 7) {
      idleGlpiModDays7Plus += 1;
    }
    if (Number.isFinite(idleDays) && idleDays >= 14) {
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
