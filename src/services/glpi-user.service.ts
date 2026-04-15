import type { Prisma } from "@prisma/client";
import type { NormalizedTicket } from "../types/glpi.types";
import { extractObserversFromTicketRaw, type ObserverRow } from "../utils/ticket-observers";
import { extractRequesterContact, type RequesterContact } from "../utils/ticket-requester";
import { glpiClient } from "./glpi.client";

const userContactCache = new Map<number, RequesterContact | null>();

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * GET /User/:id em variantes comuns da API GLPI v2 (OpenAPI varia por instalação).
 */
async function fetchGlpiUserContactOnce(userId: number): Promise<RequesterContact | null> {
  const paths = [
    `/v2/Management/User/${userId}`,
    `/v2/Management/Users/${userId}`,
    `/v2/User/${userId}`,
    `/v2/Users/${userId}`,
    `/v2/Core/User/${userId}`
  ];
  for (const path of paths) {
    try {
      const res = await glpiClient.get(path, { validateStatus: () => true });
      if (res.status < 200 || res.status >= 300 || res.data == null) {
        continue;
      }
      const body = asRecord(res.data);
      const inner = (body.data ?? body.item ?? body.user ?? res.data) as unknown;
      const c = extractRequesterContact({ user: inner });
      if (c.displayName || c.email) {
        return { displayName: c.displayName, email: c.email, userId: c.userId ?? userId };
      }
    } catch {
      /* tenta próximo path */
    }
  }
  return null;
}

export async function fetchCachedGlpiUserContact(userId: number): Promise<RequesterContact | null> {
  if (userId <= 0) {
    return null;
  }
  if (userContactCache.has(userId)) {
    return userContactCache.get(userId)!;
  }
  const contact = await fetchGlpiUserContactOnce(userId);
  userContactCache.set(userId, contact);
  return contact;
}

function hasRequesterEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.trim().includes("@"));
}

/** Se temos ID do requerente mas faltar nome ou e-mail útil, busca o perfil na API User. */
export async function enrichNormalizedTicketRequester(normalized: NormalizedTicket): Promise<NormalizedTicket> {
  const uid = normalized.requester_user_id;
  if (uid == null || uid <= 0) {
    return normalized;
  }
  const hasName = Boolean(normalized.requester_name && normalized.requester_name.trim());
  const hasEmail = hasRequesterEmail(normalized.requester_email);
  if (hasName && hasEmail) {
    return normalized;
  }

  const contact = await fetchCachedGlpiUserContact(uid);
  if (!contact || (!contact.displayName && !contact.email)) {
    return normalized;
  }

  const baseRaw = normalized.raw;
  let nextRaw: Prisma.InputJsonValue = baseRaw;
  if (baseRaw && typeof baseRaw === "object" && !Array.isArray(baseRaw)) {
    const merged: Record<string, unknown> = { ...(baseRaw as Record<string, unknown>) };
    if (contact.displayName) {
      merged.users_id_requester_name = contact.displayName;
    }
    if (contact.email) {
      merged.users_id_requester_email = contact.email;
    }
    nextRaw = merged as Prisma.InputJsonValue;
  }

  return {
    ...normalized,
    requester_name: hasName ? normalized.requester_name : contact.displayName ?? normalized.requester_name,
    requester_email: hasEmail ? normalized.requester_email : contact.email ?? normalized.requester_email,
    requester_user_id: uid,
    raw: nextRaw
  };
}

export async function enrichObserverRows(rows: ObserverRow[]): Promise<ObserverRow[]> {
  if (rows.length === 0) {
    return rows;
  }
  return Promise.all(
    rows.map(async (r) => {
      const uid = r.userId;
      if (uid == null || uid <= 0) {
        return r;
      }
      const hasName = Boolean(r.displayName?.trim());
      const hasEmail = hasRequesterEmail(r.email);
      if (hasName && hasEmail) {
        return r;
      }
      const c = await fetchCachedGlpiUserContact(uid);
      if (!c) {
        return r;
      }
      return {
        userId: uid,
        displayName: hasName ? r.displayName : c.displayName ?? r.displayName,
        email: hasEmail ? r.email : c.email ?? r.email
      };
    })
  );
}

function mergeObserversResolvedIntoRaw(baseRaw: Prisma.InputJsonValue, resolved: ObserverRow[]): Prisma.InputJsonValue {
  if (!baseRaw || typeof baseRaw !== "object" || Array.isArray(baseRaw)) {
    return baseRaw;
  }
  const merged = { ...(baseRaw as Record<string, unknown>) };
  merged.__gti_observers_resolved = resolved.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    email: r.email
  }));
  return merged as Prisma.InputJsonValue;
}

/** Resolve observadores (nome/e-mail) e grava em `rawJson.__gti_observers_resolved`. */
export async function enrichNormalizedTicketObservers(normalized: NormalizedTicket): Promise<NormalizedTicket> {
  const rows = extractObserversFromTicketRaw(normalized.raw, normalized.requester_user_id ?? null);
  const baseRaw = normalized.raw;
  if (rows.length === 0) {
    if (baseRaw && typeof baseRaw === "object" && !Array.isArray(baseRaw)) {
      const r = baseRaw as Record<string, unknown>;
      if ("__gti_observers_resolved" in r) {
        const merged = { ...r };
        delete merged.__gti_observers_resolved;
        return { ...normalized, raw: merged as Prisma.InputJsonValue };
      }
    }
    return normalized;
  }
  const resolved = await enrichObserverRows(rows);
  return {
    ...normalized,
    raw: mergeObserversResolvedIntoRaw(normalized.raw, resolved)
  };
}
