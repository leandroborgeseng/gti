import { Prisma } from "@prisma/client";
import { logger } from "../config/logger";
import { NormalizedTicket } from "../types/glpi.types";

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
    if (role === "assigned" && type === "group") {
      const id = asNumber(teamItem.id ?? teamItem.group_id ?? teamItem.groups_id);
      const name = asString(teamItem.name ?? teamItem.group_name);
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
    asNumber(fromGroupTech.id ?? fromGroupTech.group_id ?? fromGroupTech.groups_id) ??
    fromTeam.id ??
    fromAssignedGroups.id;

  const contractGroupName =
    asString(fromGroupTech.name ?? fromGroupTech.group_name) ??
    fromTeam.name ??
    fromAssignedGroups.name;

  if (contractGroupId === null) {
    logger.warn({ ticketId }, "Ticket sem grupo tecnico atribuido");
  }

  return {
    id: ticketId || 0,
    title: asString(ticket.name ?? ticket.title),
    content: asString(ticket.content),
    status: toNullableString(ticket.status),
    priority: toNullableString(ticket.priority),
    date_creation: asString(ticket.date_creation ?? ticket.date ?? ticket.created_at),
    contract_group_id: contractGroupId,
    contract_group_name: contractGroupName,
    raw: ticket as Prisma.InputJsonValue
  };
}
