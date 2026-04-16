import { Prisma } from "@prisma/client";
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

function extractFromTeam(teamValue: unknown): { id: number | null; name: string | null } {
  if (!Array.isArray(teamValue)) {
    return { id: null, name: null };
  }

  for (const item of teamValue) {
    const teamItem = asObject(item);
    const role = asString(teamItem.role)?.toLowerCase();
    const type = asString(teamItem.type)?.toLowerCase();
    const href = asString(teamItem.href)?.toLowerCase();
    const isGroupType = type === "group" || Boolean(href && href.includes("/group.form.php"));
    if (role === "assigned" && isGroupType) {
      const id = asNumber(teamItem.id ?? teamItem.group_id ?? teamItem.groups_id);
      const name = asString(teamItem.display_name ?? teamItem.name ?? teamItem.group_name ?? teamItem.completename);
      return { id, name };
    }
  }

  return { id: null, name: null };
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
    raw: ticket as Prisma.InputJsonValue
  };
}
