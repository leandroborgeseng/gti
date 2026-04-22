import type { TicketWhereInput } from "../types/ticket-where";
import { ticketWhereClosed, ticketWhereNotClosed } from "./ticket-status";

export function pendenciaFilterWhere(raw: string): TicketWhereInput | null {
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

export type KanbanFilterInput = {
  q: string;
  statusFilter: string;
  groupFilter: string;
  onlyOpen: boolean;
  pendenciaParam: string;
  /** Filtro exacto por e-mail do requerente (query `requesterEmail`). */
  requesterEmail?: string;
  /** Filtro exacto por nome do requerente (query `requesterName`). */
  requesterName?: string;
  /**
   * Se true, restringe a tickets não fechados mesmo com onlyOpen=false.
   * Usado no painel «Idade dos chamados abertos» (sempre só abertos + filtros).
   */
  forceNonClosed?: boolean;
};

export function buildKanbanWhere(input: KanbanFilterInput): TicketWhereInput {
  const {
    q,
    statusFilter,
    groupFilter,
    onlyOpen,
    pendenciaParam,
    forceNonClosed,
    requesterEmail: requesterEmailRaw,
    requesterName: requesterNameRaw
  } = input;
  const requesterEmail = (requesterEmailRaw ?? "").trim();
  const requesterName = (requesterNameRaw ?? "").trim();
  const pendenciaWhereClause = pendenciaFilterWhere(pendenciaParam);
  const enforceNotClosed = onlyOpen || Boolean(forceNonClosed);

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
      ...(requesterEmail ? [{ requesterEmail: { equals: requesterEmail } }] : []),
      ...(requesterName ? [{ requesterName: { equals: requesterName } }] : []),
      ...(enforceNotClosed ? [ticketWhereNotClosed()] : []),
      ...(pendenciaWhereClause ? [pendenciaWhereClause] : [])
    ]
  };
}

/**
 * Chamados com status de fechado no cache, com os mesmos filtros de texto/grupo/pendência
 * que o Kanban (`onlyOpen` e `forceNonClosed` ignorados — o stock é sempre «fechados»).
 */
export function buildKanbanWhereClosed(input: KanbanFilterInput): TicketWhereInput {
  const { q, statusFilter, groupFilter, pendenciaParam, requesterEmail: reRaw, requesterName: rnRaw } = input;
  const requesterEmail = (reRaw ?? "").trim();
  const requesterName = (rnRaw ?? "").trim();
  const pendenciaWhereClause = pendenciaFilterWhere(pendenciaParam);
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
      ...(requesterEmail ? [{ requesterEmail: { equals: requesterEmail } }] : []),
      ...(requesterName ? [{ requesterName: { equals: requesterName } }] : []),
      ticketWhereClosed(),
      ...(pendenciaWhereClause ? [pendenciaWhereClause] : [])
    ]
  };
}
