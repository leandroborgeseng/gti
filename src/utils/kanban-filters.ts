import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ageBucketToPrismaWhere } from "./open-ticket-aging";
import { ticketWhereNotClosed } from "./ticket-status";

export function pendenciaFilterWhere(raw: string): Prisma.TicketWhereInput | null {
  const p = raw.trim().toLowerCase();
  if (!p) {
    return null;
  }
  if (p === "cliente") {
    return { waitingParty: "cliente" };
  }
  if (p === "empresa") {
    return { waitingParty: "empresa" };
  }
  if (p === "na" || p === "encerrado") {
    return { waitingParty: "na" };
  }
  if (p === "desconhecido" || p === "unknown") {
    return { waitingParty: "unknown" };
  }
  return null;
}

export function pendenciaLabelForSummary(value: string): string {
  const p = value.trim().toLowerCase();
  if (p === "cliente") {
    return "Aguardando cliente (nao depende da empresa)";
  }
  if (p === "empresa") {
    return "Aguardando empresa / equipe";
  }
  if (p === "na" || p === "encerrado") {
    return "Encerrado / sem pendencia (inferencia)";
  }
  if (p === "desconhecido" || p === "unknown") {
    return "Pendencia indefinida (cache)";
  }
  return "(todas)";
}

export function ageLabelForSummary(ageBucket: string): string {
  const k = ageBucket.trim().toLowerCase();
  if (k === "week") {
    return "Esta semana (ate 7 dias)";
  }
  if (k === "d15") {
    return "8 a 15 dias abertos";
  }
  if (k === "d30") {
    return "16 a 30 dias abertos";
  }
  if (k === "d60") {
    return "31 a 60 dias abertos";
  }
  if (k === "over") {
    return "Mais de 60 dias abertos";
  }
  return "(todas as idades)";
}

export type KanbanFilterInput = {
  q: string;
  statusFilter: string;
  groupFilter: string;
  assignedGroupFilter: string;
  onlyOpen: boolean;
  pendenciaParam: string;
  /** week | d15 | d30 | d60 | over — vazio ignora. */
  ageBucket: string;
};

async function assignedGroupTicketIds(assignedGroupFilter: string): Promise<number[]> {
  if (assignedGroupFilter.trim().length === 0) {
    return [];
  }
  return (
    await prisma.ticketAttribute.findMany({
      where: {
        OR: [
          { keyPath: { contains: "team" } },
          { keyPath: { contains: "group" } },
          { keyPath: { contains: "assigned" } }
        ],
        AND: [
          {
            OR: [{ valueText: { contains: assignedGroupFilter } }, { valueJson: { contains: assignedGroupFilter } }]
          }
        ]
      },
      select: { ticketId: true },
      distinct: ["ticketId"],
      take: 5000
    })
  ).map((row) => row.ticketId);
}

export async function buildKanbanWhere(input: KanbanFilterInput): Promise<Prisma.TicketWhereInput> {
  const { q, statusFilter, groupFilter, assignedGroupFilter, onlyOpen, pendenciaParam, ageBucket } = input;
  const pendenciaWhereClause = pendenciaFilterWhere(pendenciaParam);
  const ageWhereClause = ageBucketToPrismaWhere(ageBucket);
  const ids = await assignedGroupTicketIds(assignedGroupFilter);
  const enforceOpenForAge = Boolean(ageWhereClause);

  return {
    AND: [
      q
        ? {
            OR: [
              { title: { contains: q } },
              { content: { contains: q } },
              { glpiTicketId: Number.isFinite(Number(q)) ? Number(q) : -1 }
            ]
          }
        : {},
      statusFilter ? { status: statusFilter } : {},
      groupFilter ? { contractGroupName: { contains: groupFilter } } : {},
      assignedGroupFilter
        ? {
            OR: [
              { contractGroupName: { contains: assignedGroupFilter } },
              ...(ids.length > 0 ? [{ id: { in: ids } }] : [])
            ]
          }
        : {},
      ...(onlyOpen || enforceOpenForAge ? [ticketWhereNotClosed()] : []),
      ...(pendenciaWhereClause ? [pendenciaWhereClause] : []),
      ...(ageWhereClause ? [ageWhereClause] : [])
    ]
  };
}
