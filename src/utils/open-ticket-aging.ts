import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
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

export async function getOpenTicketAgeBuckets(): Promise<OpenAgeBuckets> {
  const rows = await prisma.ticket.findMany({
    where: ticketWhereNotClosed(),
    select: { dateCreation: true }
  });

  const now = Date.now();
  const out: OpenAgeBuckets = {
    week: 0,
    days15: 0,
    days30: 0,
    days60: 0,
    over60: 0,
    noDate: 0
  };

  for (const row of rows) {
    if (!row.dateCreation || !row.dateCreation.trim()) {
      out.noDate += 1;
      continue;
    }
    const t = Date.parse(row.dateCreation);
    if (!Number.isFinite(t)) {
      out.noDate += 1;
      continue;
    }
    const days = Math.floor((now - t) / DAY_MS);
    if (days < 0) {
      out.noDate += 1;
      continue;
    }
    if (days <= 7) {
      out.week += 1;
    } else if (days <= 15) {
      out.days15 += 1;
    } else if (days <= 30) {
      out.days30 += 1;
    } else if (days <= 60) {
      out.days60 += 1;
    } else {
      out.over60 += 1;
    }
  }

  return out;
}

export function sumOpenAgeBuckets(b: OpenAgeBuckets): number {
  return b.week + b.days15 + b.days30 + b.days60 + b.over60 + b.noDate;
}

const VALID_AGE_BUCKETS = new Set(["week", "d15", "d30", "d60", "over"]);

export function normalizeAgeBucketParam(raw: string): string {
  const k = raw.trim().toLowerCase();
  return VALID_AGE_BUCKETS.has(k) ? k : "";
}

function isoCutoff(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Filtro Prisma em `dateCreation` (string ISO) alinhado às mesmas faixas do dashboard de idade.
 * Só usar em conjunto com `ticketWhereNotClosed()`.
 */
export function ageBucketToPrismaWhere(bucket: string): Prisma.TicketWhereInput | null {
  const b = normalizeAgeBucketParam(bucket);
  if (!b) {
    return null;
  }
  const now = Date.now();

  if (b === "week") {
    return {
      AND: [{ dateCreation: { not: null } }, { dateCreation: { gt: isoCutoff(now - 8 * DAY_MS) } }]
    };
  }
  if (b === "d15") {
    return {
      AND: [
        { dateCreation: { not: null } },
        { dateCreation: { gt: isoCutoff(now - 16 * DAY_MS) } },
        { dateCreation: { lte: isoCutoff(now - 8 * DAY_MS) } }
      ]
    };
  }
  if (b === "d30") {
    return {
      AND: [
        { dateCreation: { not: null } },
        { dateCreation: { gt: isoCutoff(now - 31 * DAY_MS) } },
        { dateCreation: { lte: isoCutoff(now - 16 * DAY_MS) } }
      ]
    };
  }
  if (b === "d60") {
    return {
      AND: [
        { dateCreation: { not: null } },
        { dateCreation: { gt: isoCutoff(now - 61 * DAY_MS) } },
        { dateCreation: { lte: isoCutoff(now - 31 * DAY_MS) } }
      ]
    };
  }
  if (b === "over") {
    return {
      AND: [{ dateCreation: { not: null } }, { dateCreation: { lte: isoCutoff(now - 61 * DAY_MS) } }]
    };
  }
  return null;
}
