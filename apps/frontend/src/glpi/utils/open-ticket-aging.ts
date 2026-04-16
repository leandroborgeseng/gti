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

/**
 * @param filterWhere Critérios adicionais (ex.: mesmo `buildKanbanWhere` com `forceNonClosed: true`).
 *                    Se omitido, conta todos os abertos no cache.
 */
export async function getOpenTicketAgeBuckets(filterWhere?: Prisma.TicketWhereInput): Promise<OpenAgeBuckets> {
  const where = filterWhere ?? ticketWhereNotClosed();
  const rows = await prisma.ticket.findMany({
    where,
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
