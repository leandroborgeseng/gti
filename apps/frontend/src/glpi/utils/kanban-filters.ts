import type { TicketWhereInput } from "../types/ticket-where";
import { ticketWhereClosed, ticketWhereNotClosed } from "./ticket-status";

export function pendenciaFilterWhere(raw: string): TicketWhereInput | null {
  const p = raw.trim().toLowerCase();
  if (!p) {
    return null;
  }
  if (p === "nao_inferido") {
    return { OR: [{ waitingParty: null }, { waitingParty: "" }] };
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
  if (p === "nao_inferido") {
    return "Pendência não inferida (cache)";
  }
  return "(todas)";
}

/** Coorte de idade alinhada aos KPIs do painel de operação (query `cohort`). */
export function parseOpsCohortParam(raw: string | undefined | null): "ops_over30" | "ops_over60" | null {
  const t = (raw ?? "").trim();
  if (t === "ops_over30" || t === "ops_over60") return t;
  return null;
}

function statusWhereClause(statusFilter: string): TicketWhereInput {
  const s = statusFilter.trim();
  if (!s) return {};
  if (s === "__NULL__") {
    return { OR: [{ status: null }, { status: "" }] };
  }
  return { status: s };
}

function groupWhereClause(input: KanbanFilterInput): TicketWhereInput {
  const names = input.groupInNames?.filter((x) => x !== undefined) ?? [];
  const trimmed = names.map((x) => String(x).trim());
  if (trimmed.length > 0) {
    const parts: TicketWhereInput[] = trimmed.map((g) => {
      if (g === "" || g === "__EMPTY__") {
        return { OR: [{ contractGroupName: null }, { contractGroupName: "" }] };
      }
      return { contractGroupName: { equals: g } };
    });
    return parts.length === 1 ? parts[0]! : { OR: parts };
  }
  if (input.groupNullOnly) {
    return { OR: [{ contractGroupName: null }, { contractGroupName: "" }] };
  }
  const gf = (input.groupFilter ?? "").trim();
  if (gf) return { contractGroupName: { contains: gf } };
  return {};
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
  /** Vários grupos (contrato) em disjunção — query `groupInJson` (JSON array de strings; vazio = sem grupo). */
  groupInNames?: string[];
  /** Sem `contractGroupName` — query `groupNull=1`. */
  groupNullOnly?: boolean;
  /** GLPI `users_id_tec` persistido no cache — query `assignedUserId`. */
  assignedUserId?: number;
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
    onlyOpen,
    pendenciaParam,
    forceNonClosed,
    requesterEmail: requesterEmailRaw,
    requesterName: requesterNameRaw,
    assignedUserId: assignedUserIdRaw
  } = input;
  const requesterEmail = (requesterEmailRaw ?? "").trim();
  const requesterName = (requesterNameRaw ?? "").trim();
  const assignedUserId =
    assignedUserIdRaw != null && Number.isFinite(assignedUserIdRaw) && assignedUserIdRaw > 0
      ? assignedUserIdRaw
      : null;
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
      statusWhereClause(statusFilter),
      groupWhereClause(input),
      ...(requesterEmail ? [{ requesterEmail: { equals: requesterEmail } }] : []),
      ...(requesterName ? [{ requesterName: { equals: requesterName } }] : []),
      ...(assignedUserId ? [{ assignedUserId: { equals: assignedUserId } }] : []),
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
  const { q, statusFilter, pendenciaParam, requesterEmail: reRaw, requesterName: rnRaw, assignedUserId: aidRaw } = input;
  const requesterEmail = (reRaw ?? "").trim();
  const requesterName = (rnRaw ?? "").trim();
  const assignedUserId =
    aidRaw != null && Number.isFinite(aidRaw) && aidRaw > 0 ? aidRaw : null;
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
      statusWhereClause(statusFilter),
      groupWhereClause(input),
      ...(requesterEmail ? [{ requesterEmail: { equals: requesterEmail } }] : []),
      ...(requesterName ? [{ requesterName: { equals: requesterName } }] : []),
      ...(assignedUserId ? [{ assignedUserId: { equals: assignedUserId } }] : []),
      ticketWhereClosed(),
      ...(pendenciaWhereClause ? [pendenciaWhereClause] : [])
    ]
  };
}
