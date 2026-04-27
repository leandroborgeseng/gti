import { extractRequesterContact } from "./ticket-requester";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 ? n : null;
  }
  return null;
}

/** Uma pessoa associada ao chamado (observador) a partir de um elemento GLPI. */
export type ObserverRow = {
  userId: number | null;
  displayName: string | null;
  email: string | null;
};

function contactFromUserLike(value: unknown): ObserverRow {
  if (value == null) {
    return { userId: null, displayName: null, email: null };
  }
  if (typeof value === "number" || typeof value === "string") {
    return { userId: parsePositiveInt(value), displayName: null, email: null };
  }
  const o = asRecord(value);
  const c = extractRequesterContact({ user: value });
  const uid =
    c.userId ??
    parsePositiveInt(o.users_id ?? o.id ?? o.user_id ?? o.users_id_link ?? o.usersId ?? o.user_id_link);
  return {
    userId: uid,
    displayName: c.displayName,
    email: c.email
  };
}

function addRow(list: ObserverRow[], seen: Set<string>, row: ObserverRow, excludeUserId: number | null): void {
  if (excludeUserId != null && excludeUserId > 0 && row.userId === excludeUserId) {
    return;
  }
  const key =
    row.userId != null && row.userId > 0
      ? `id:${row.userId}`
      : `anon:${(row.displayName ?? "").trim()}|${(row.email ?? "").trim()}`;
  if (seen.has(key)) {
    return;
  }
  if (
    (row.userId == null || row.userId <= 0) &&
    !(row.displayName && row.displayName.trim()) &&
    !(row.email && row.email.trim())
  ) {
    return;
  }
  seen.add(key);
  list.push(row);
}

function collectFromArray(arr: unknown, list: ObserverRow[], seen: Set<string>, excludeUserId: number | null): void {
  if (!Array.isArray(arr)) {
    return;
  }
  for (const item of arr) {
    addRow(list, seen, contactFromUserLike(item), excludeUserId);
  }
}

/**
 * Observadores do chamado (GLPI: _users_id_observer, lista team/actors com papel observer, etc.).
 * Não inclui o solicitante (`excludeRequesterUserId`).
 */
export function extractObserversFromTicketRaw(rawJson: unknown, excludeRequesterUserId: number | null): ObserverRow[] {
  const ticket = asRecord(rawJson);
  const seen = new Set<string>();
  const list: ObserverRow[] = [];

  collectFromArray(ticket._users_id_observer, list, seen, excludeRequesterUserId);
  collectFromArray(ticket._users_id_observers, list, seen, excludeRequesterUserId);
  collectFromArray(ticket.observers, list, seen, excludeRequesterUserId);
  collectFromArray(ticket._observer, list, seen, excludeRequesterUserId);
  collectFromArray(ticket.watchers, list, seen, excludeRequesterUserId);

  const uidObs = ticket.users_id_observer;
  if (uidObs !== undefined && uidObs !== null) {
    addRow(list, seen, contactFromUserLike(uidObs), excludeRequesterUserId);
  }

  const singleObs = ticket.observer;
  if (singleObs && typeof singleObs === "object") {
    addRow(list, seen, contactFromUserLike(singleObs), excludeRequesterUserId);
  } else if (typeof singleObs === "number" || typeof singleObs === "string") {
    addRow(list, seen, contactFromUserLike(singleObs), excludeRequesterUserId);
  }

  const teamArrays = [ticket.team, ticket._team, ticket.actors, ticket._actors, ticket.actor];
  for (const team of teamArrays) {
    if (!Array.isArray(team)) {
      continue;
    }
    for (const row of team) {
      const o = asRecord(row);
      const type = String(o.type ?? o.role ?? o.actor_type ?? o.itemtype ?? "").toLowerCase();
      const isObsFlag = o.observer === true || o.is_observer === true || o.isObserver === true;
      if (
        !type.includes("observer") &&
        !type.includes("observador") &&
        !type.includes("watcher") &&
        !isObsFlag
      ) {
        continue;
      }
      addRow(list, seen, contactFromUserLike(o), excludeRequesterUserId);
    }
  }

  return list;
}
