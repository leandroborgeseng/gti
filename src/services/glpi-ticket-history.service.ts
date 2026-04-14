import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { glpiClient } from "./glpi.client";
import { getDiscoveredTicketsPath } from "./openapi.loader";
import { resolveTicketsPath } from "./tickets.service";
import { isTicketClosedStatus, ticketWhereNotClosed } from "../utils/ticket-status";
import { fetchGlpiTicketJson } from "./glpi-ticket-write.service";

function ticketItemBase(glpiId: number): string {
  const base = resolveTicketsPath(getDiscoveredTicketsPath()).replace(/\/$/, "");
  return `${base}/${glpiId}`;
}

function pickList(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.data)) {
      return o.data;
    }
    if (Array.isArray(o.items)) {
      return o.items;
    }
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

const FOLLOWUP_SUFFIXES = ["ItilFollowup", "ITILFollowup", "Followup", "TicketFollowup", "itil_followup"];
const TASK_SUFFIXES = ["TicketTask", "ITILTask", "Task", "ticket_task"];

async function fetchSubcollection(glpiId: number, suffixes: string[]): Promise<unknown[]> {
  const base = ticketItemBase(glpiId);
  for (const suffix of suffixes) {
    const url = `${base}/${suffix}`;
    try {
      const res = await glpiClient.get<unknown>(url, {
        params: { start: 0, limit: 500 },
        validateStatus: () => true
      });
      if (res.status !== 200 && res.status !== 206) {
        continue;
      }
      const list = pickList(res.data);
      logger.info({ glpiId, suffix, count: list.length }, "Sub-recurso GLPI carregado");
      return list;
    } catch (error) {
      logger.warn({ glpiId, suffix, error: String(error) }, "Falha ao buscar sub-recurso GLPI");
    }
  }
  return [];
}

export async function fetchGlpiTicketFollowups(glpiId: number): Promise<unknown[]> {
  return fetchSubcollection(glpiId, FOLLOWUP_SUFFIXES);
}

export async function fetchGlpiTicketTasks(glpiId: number): Promise<unknown[]> {
  return fetchSubcollection(glpiId, TASK_SUFFIXES);
}

export type HistoryTimelineKind = "opening" | "followup" | "task";

export interface HistoryTimelineItemDto {
  kind: HistoryTimelineKind;
  date: string | null;
  usersId: number | null;
  authorLabel: string | null;
  isPrivate: boolean;
  title: string | null;
  contentHtml: string;
}

export type WaitingParty = "cliente" | "empresa" | "unknown" | "na";

export interface TicketHistoryBundleDto {
  items: HistoryTimelineItemDto[];
  waitingOn: WaitingParty;
  waitingLabel: string;
  waitingDetail: string;
  historyError?: string;
}

function collectRequesterUserIds(raw: Record<string, unknown>): Set<number> {
  const ids = new Set<number>();
  const add = (v: number | null) => {
    if (v !== null && v > 0) {
      ids.add(v);
    }
  };
  add(num(raw.users_id_recipient));
  add(num(raw.users_id_requester));
  const reqArr = raw._users_id_requester;
  if (Array.isArray(reqArr)) {
    for (const x of reqArr) {
      add(num(x));
    }
  }
  const actors = raw.actors ?? raw.actor ?? raw._actors;
  if (Array.isArray(actors)) {
    for (const row of actors) {
      const o = asRecord(row);
      const type = String(o.type ?? o.role ?? o.actor_type ?? "").toLowerCase();
      if (type.includes("requester") || type.includes("recipient") || type.includes("requerente")) {
        add(num(o.id ?? o.users_id ?? o.user_id));
      }
    }
  }
  return ids;
}

function authorFromUserObject(value: unknown): string | null {
  const o = asRecord(value);
  const name = o.name ?? o.login ?? o.realname;
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }
  const fn = o.firstname;
  const ln = o.lastname;
  if (typeof fn === "string" || typeof ln === "string") {
    return [fn, ln].filter(Boolean).join(" ").trim() || null;
  }
  return null;
}

function normalizeFollowup(row: unknown): HistoryTimelineItemDto {
  const o = asRecord(row);
  const content = String(o.content ?? o.body ?? "");
  const date =
    (typeof o.date_creation === "string" && o.date_creation) ||
    (typeof o.date === "string" && o.date) ||
    (typeof o.updated_at === "string" && o.updated_at) ||
    null;
  const usersId = num(o.users_id ?? o.user_id);
  const isPrivate = Boolean(o.is_private ?? o.isPrivate);
  const authorLabel = authorFromUserObject(o.user ?? o.author ?? o.users ?? o.user_link);
  return {
    kind: "followup",
    date,
    usersId,
    authorLabel,
    isPrivate,
    title: "Acompanhamento",
    contentHtml: content
  };
}

function normalizeTask(row: unknown): HistoryTimelineItemDto {
  const o = asRecord(row);
  const content = String(o.content ?? "");
  const date =
    (typeof o.date_creation === "string" && o.date_creation) ||
    (typeof o.date === "string" && o.date) ||
    (typeof o.begin === "string" && o.begin) ||
    null;
  const usersId = num(o.users_id_tech ?? o.users_id ?? o.user_id);
  const isPrivate = Boolean(o.is_private ?? o.isPrivate);
  const authorLabel = authorFromUserObject(o.user ?? o.users ?? o.author);
  return {
    kind: "task",
    date,
    usersId,
    authorLabel,
    isPrivate,
    title: "Tarefa",
    contentHtml: content
  };
}

function compareHistoryDates(a: HistoryTimelineItemDto, b: HistoryTimelineItemDto): number {
  const da = a.date ? Date.parse(a.date) : 0;
  const db = b.date ? Date.parse(b.date) : 0;
  if (da !== db) {
    return da - db;
  }
  if (a.kind !== b.kind) {
    return a.kind === "opening" ? -1 : 1;
  }
  return 0;
}

export function buildTicketHistoryBundle(
  ticketRawUnknown: unknown,
  followups: unknown[],
  tasks: unknown[],
  options: { statusLabel: string | null }
): TicketHistoryBundleDto {
  const raw = asRecord(ticketRawUnknown);
  const items: HistoryTimelineItemDto[] = [];

  const openDate =
    (typeof raw.date_creation === "string" && raw.date_creation) ||
    (typeof raw.created_at === "string" && raw.created_at) ||
    null;
  const openUser = num(raw.users_id_recipient ?? raw.users_id_requester);
  items.push({
    kind: "opening",
    date: openDate,
    usersId: openUser,
    authorLabel: authorFromUserObject(raw.user ?? raw.requester ?? raw.author),
    isPrivate: false,
    title: "Abertura do chamado",
    contentHtml: String(raw.content ?? raw.description ?? "")
  });

  for (const f of followups) {
    items.push(normalizeFollowup(f));
  }
  for (const t of tasks) {
    items.push(normalizeTask(t));
  }

  items.sort(compareHistoryDates);

  if (isTicketClosedStatus(options.statusLabel)) {
    return {
      items,
      waitingOn: "na",
      waitingLabel: "Chamado encerrado",
      waitingDetail: "Status atual indica fechamento ou solução; não há resposta pendente no fluxo."
    };
  }

  const requesterIds = collectRequesterUserIds(raw);
  const publicItems = items.filter((i) => !i.isPrivate);
  const chain = publicItems.length > 0 ? publicItems : items;
  const last = chain[chain.length - 1];

  if (!last) {
    return {
      items,
      waitingOn: "unknown",
      waitingLabel: "Histórico vazio",
      waitingDetail: "Não há mensagens para inferir quem deve responder."
    };
  }

  if (last.kind === "opening") {
    return {
      items,
      waitingOn: "empresa",
      waitingLabel: "Aguardando ação da empresa",
      waitingDetail:
        "Só há o registro de abertura (ou as demais entradas são privadas). A equipe deve dar o próximo passo."
    };
  }

  if (last.usersId !== null && last.usersId > 0 && requesterIds.has(last.usersId)) {
    return {
      items,
      waitingOn: "empresa",
      waitingLabel: "Aguardando ação da empresa",
      waitingDetail:
        "A última interação visível partiu do solicitante (ou usuário associado ao papel de requerente). A equipe deve responder."
    };
  }

  if (last.usersId !== null && last.usersId > 0) {
    return {
      items,
      waitingOn: "cliente",
      waitingLabel: "Aguardando retorno do cliente",
      waitingDetail:
        "A última interação visível não é do requerente identificado; em geral é técnico/equipe — espera-se retorno do cliente."
    };
  }

  return {
    items,
    waitingOn: "unknown",
    waitingLabel: "Indefinido",
    waitingDetail:
      "Não foi possível associar o autor da última mensagem ao solicitante. Confira o histórico abaixo ou no GLPI."
  };
}

export async function loadTicketHistoryFromGlpi(
  glpiId: number,
  statusLabel: string | null
): Promise<TicketHistoryBundleDto> {
  try {
    const [freshRaw, followups, taskList] = await Promise.all([
      fetchGlpiTicketJson(glpiId),
      fetchGlpiTicketFollowups(glpiId),
      fetchGlpiTicketTasks(glpiId)
    ]);
    return buildTicketHistoryBundle(freshRaw, followups, taskList, { statusLabel });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ glpiId, message }, "Falha ao montar historico GLPI");
    return {
      items: [],
      waitingOn: "unknown",
      waitingLabel: "Histórico indisponível",
      waitingDetail: message,
      historyError: message
    };
  }
}

/** Carrega histórico no GLPI, grava `waitingParty` no SQLite e devolve o bundle para a API. */
export async function loadAndPersistWaitingParty(
  glpiId: number,
  statusLabel: string | null
): Promise<TicketHistoryBundleDto> {
  const history = await loadTicketHistoryFromGlpi(glpiId, statusLabel);
  await prisma.ticket.updateMany({
    where: { glpiTicketId: glpiId },
    data: { waitingParty: history.waitingOn }
  });
  return history;
}

/**
 * Preenche `waitingParty` para tickets abertos ainda sem cache (limitado por chamada).
 * Usado após sync para ir populando o filtro sem abrir cada modal.
 */
export async function enrichWaitingPartyBatch(limit: number): Promise<number> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 0), 80);
  if (safeLimit === 0) {
    return 0;
  }
  const rows = await prisma.ticket.findMany({
    where: {
      AND: [
        ticketWhereNotClosed(),
        {
          OR: [{ waitingParty: null }, { waitingParty: "" }]
        }
      ]
    },
    select: { glpiTicketId: true, status: true },
    take: safeLimit,
    orderBy: { updatedAt: "asc" }
  });
  let updated = 0;
  for (const row of rows) {
    try {
      await loadAndPersistWaitingParty(row.glpiTicketId, row.status);
      updated += 1;
    } catch (error) {
      logger.warn({ glpiTicketId: row.glpiTicketId, error: String(error) }, "enrichWaitingPartyBatch: ticket ignorado");
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (updated > 0) {
    logger.info({ updated, attempted: rows.length }, "waitingParty enriquecido em lote");
  }
  return updated;
}
