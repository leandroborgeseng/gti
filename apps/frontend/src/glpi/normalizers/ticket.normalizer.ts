import type { InputJsonValue } from "@prisma/client/runtime/library";
import { logger } from "../config/logger";
import { NormalizedTicket } from "../types/glpi.types";
import { extractRequesterContact } from "../utils/ticket-requester";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function toNullableString(value: unknown): string | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const asObj = value as JsonObject;
    const fromName = asString(asObj.name ?? asObj.label ?? asObj.title);
    if (fromName !== null) {
      return fromName;
    }
    const fromId = asNumber(asObj.id);
    if (fromId !== null) {
      return String(fromId);
    }
  }
  const direct = asString(value);
  if (direct !== null) {
    return direct;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

/**
 * Papel de ator em chamados GLPI: na UI costuma ser string, na API / serialização
 * muitas vezes vem **número** (1 requerente, 2 atribuído, 3 observador — CommonITILActor).
 * Sem isto, `role === 2` falha e ignoramos o técnico com grupo + user na `team`.
 */
function itilActorRoleKey(raw: unknown): "requester" | "assigned" | "observer" | "other" {
  if (raw === 1) {
    return "requester";
  }
  if (raw === 2) {
    return "assigned";
  }
  if (raw === 3) {
    return "observer";
  }
  const s = (typeof raw === "string" ? raw : String(raw ?? "")).toLowerCase();
  if (s.includes("requisi") || s.includes("requester") || s.includes("requerente") || s.includes("recipient")) {
    return "requester";
  }
  if (
    s === "assign" ||
    s === "assigned" ||
    s.includes("assign") ||
    s.includes("atribu") ||
    s.includes("tecnico") ||
    s.includes("tech")
  ) {
    return "assigned";
  }
  if (s.includes("observ") || s.includes("watcher")) {
    return "observer";
  }
  return "other";
}

function extractFromTeam(teamValue: unknown): { id: number | null; name: string | null } {
  if (!Array.isArray(teamValue)) {
    return { id: null, name: null };
  }

  for (const item of teamValue) {
    const teamItem = asObject(item);
    const roleKey = itilActorRoleKey(teamItem.role);
    const type = asString(teamItem.type)?.toLowerCase();
    const href = asString(teamItem.href)?.toLowerCase();
    const isGroupType = type === "group" || Boolean(href && href.includes("/group.form.php"));
    if (roleKey === "assigned" && isGroupType) {
      const id = asNumber(teamItem.id ?? teamItem.group_id ?? teamItem.groups_id);
      const name = asString(teamItem.display_name ?? teamItem.name ?? teamItem.group_name ?? teamItem.completename);
      return { id, name };
    }
  }

  return { id: null, name: null };
}

function idFromUserTeamEntry(o: JsonObject): number | null {
  const n =
    asNumber(o.id) ??
    asNumber(o.items_id) ??
    asNumber(o.user_id) ??
    asNumber(o.users_id) ??
    null;
  if (n != null && n > 0) {
    return n;
  }
  const href = asString(o.href);
  if (href) {
    const m = /[?&]id=(\d+)/.exec(href) || /user\.form\.php\?id=(\d+)/i.exec(href) || /\/User\/(\d+)/i.exec(href);
    if (m) {
      const p = asNumber(m[1]);
      return p != null && p > 0 ? p : null;
    }
  }
  return null;
}

function isGroupTeamEntry(o: JsonObject): boolean {
  const t = (asString(o.type) ?? asString(o.itemtype) ?? "").toLowerCase();
  if (t.includes("group")) {
    return true;
  }
  const href = (asString(o.href) ?? "").toLowerCase();
  return href.includes("/group.form.php");
}

function isSupplierTeamEntry(o: JsonObject): boolean {
  const t = (asString(o.type) ?? asString(o.itemtype) ?? "").toLowerCase();
  return t.includes("supplier") || t.includes("fornecedor");
}

/**
 * Técnico (utilizador) do chamado. O GLPI permite **grupo técnico** + **utilizador** e várias entradas na
 * `team` / `actors`. Grupos e fornecedores na lista são ignorados para o ID (só procuramos User).
 * Se `users_id_tech` existir, **não** é substituído por outro id encontrado na equipa — só procuramos o nome.
 */
function pickAssignedUserFromMemberList(
  list: unknown[] | undefined,
  preferTechId: number | null
): { id: number | null; name: string | null } {
  if (!Array.isArray(list) || list.length === 0) {
    return { id: null, name: null };
  }
  const rows = list.map((x) => asObject(x));
  if (preferTechId != null && preferTechId > 0) {
    for (const o of rows) {
      if (isGroupTeamEntry(o) || isSupplierTeamEntry(o)) {
        continue;
      }
      const id = idFromUserTeamEntry(o);
      if (id === preferTechId) {
        const n = asString(o.display_name ?? o.name ?? o.realname ?? o.user_name ?? o.firstname);
        return { id: preferTechId, name: n };
      }
    }
    return { id: preferTechId, name: null };
  }

  for (const o of rows) {
    if (isGroupTeamEntry(o) || isSupplierTeamEntry(o)) {
      continue;
    }
    const roleKey = itilActorRoleKey(o.role);
    if (roleKey === "requester" || roleKey === "observer") {
      continue;
    }
    if (roleKey === "assigned") {
      const id = idFromUserTeamEntry(o);
      if (id != null && id > 0) {
        const n = asString(o.display_name ?? o.name ?? o.realname ?? o.user_name ?? o.firstname);
        return { id, name: n };
      }
    }
  }
  for (const o of rows) {
    if (isGroupTeamEntry(o) || isSupplierTeamEntry(o)) {
      continue;
    }
    const roleKey = itilActorRoleKey(o.role);
    if (roleKey === "requester" || roleKey === "observer") {
      continue;
    }
    const id = idFromUserTeamEntry(o);
    if (id != null && id > 0) {
      const n = asString(o.display_name ?? o.name ?? o.realname ?? o.user_name);
      return { id, name: n };
    }
  }
  return { id: null, name: null };
}

function extractAssignedUser(ticket: JsonObject): { id: number | null; name: string | null } {
  const userTechObj = asObject(ticket.user_tech);
  const rawTech =
    asNumber(ticket.users_id_tech) ??
    asNumber(ticket.users_id_tec) /* typo em alguns payloads */ ??
    asNumber(userTechObj.id) ??
    asNumber(ticket.user_tech) /* escalar v2 */ ??
    null;
  let techId = rawTech != null && rawTech > 0 ? rawTech : null;
  const team = Array.isArray(ticket.team) ? (ticket.team as unknown[]) : [];
  const actors = Array.isArray(ticket.actors)
    ? (ticket.actors as unknown[])
    : Array.isArray(ticket._actors)
      ? (ticket._actors as unknown[])
      : [];
  const members: unknown[] = [...team, ...actors];
  const first = pickAssignedUserFromMemberList(members, techId);
  if (techId == null) {
    techId = first.id;
  }
  const again = pickAssignedUserFromMemberList(members, techId);
  const fallback = techId ? `Utilizador #${techId}` : null;
  return { id: techId, name: again.name ?? first.name ?? fallback };
}

function extractFromAssignedGroups(value: unknown): { id: number | null; name: string | null } {
  if (!Array.isArray(value) || value.length === 0) {
    return { id: null, name: null };
  }

  const first = asObject(value[0]);
  return {
    id: asNumber(first.id ?? first.group_id ?? first.groups_id),
    name: asString(first.name ?? first.group_name)
  };
}

export function normalizeTicket(raw: unknown): NormalizedTicket {
  const ticket = asObject(raw);
  const ticketId = asNumber(ticket.id ?? ticket.ticket_id);

  const fromGroupsIdTech = asNumber(ticket.groups_id_tech);
  const fromGroupTech = asObject(ticket.group_tech);
  const fromTeam = extractFromTeam(ticket.team);
  const fromAssignedGroups = extractFromAssignedGroups(ticket.assigned_groups);

  const contractGroupId =
    fromGroupsIdTech ??
    asNumber(ticket.groups_id_assign) ??
    asNumber(ticket.groups_id_assigned) ??
    asNumber(fromGroupTech.id ?? fromGroupTech.group_id ?? fromGroupTech.groups_id) ??
    fromTeam.id ??
    fromAssignedGroups.id;

  const contractGroupName =
    asString(ticket.groups_id_assign_name ?? ticket.groups_id_assigned_name ?? ticket.assigned_group_name) ??
    asString(fromGroupTech.name ?? fromGroupTech.group_name) ??
    fromTeam.name ??
    fromAssignedGroups.name;

  if (contractGroupId === null) {
    // Evita centenas de linhas iguais em produção (Railway); use LOG_LEVEL=debug para diagnosticar.
    logger.debug({ ticketId }, "Ticket sem grupo tecnico atribuido");
  }

  const reqContact = extractRequesterContact(raw);
  const assigned = extractAssignedUser(ticket);

  return {
    id: ticketId || 0,
    title: asString(ticket.name ?? ticket.title),
    content: asString(ticket.content),
    status: toNullableString(ticket.status),
    priority: toNullableString(ticket.priority),
    date_creation: asString(ticket.date_creation ?? ticket.date ?? ticket.created_at),
    date_modification: asString(ticket.date_mod ?? ticket.date_modification ?? ticket.updated_at),
    contract_group_id: contractGroupId,
    contract_group_name: contractGroupName,
    requester_name: reqContact.displayName,
    requester_email: reqContact.email,
    requester_user_id: reqContact.userId,
    assigned_user_id: assigned.id,
    assigned_user_name: assigned.name,
    raw: ticket as InputJsonValue
  };
}
