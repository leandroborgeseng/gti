import type { ObserverRow } from "../utils/ticket-observers";
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
 * Usado sobretudo ao abrir o modal do chamado — não na sincronização em massa.
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

/** Enriquece observadores (nome/e-mail) via API User — só no fluxo do modal, não na sync. */
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
      const hasEmail = hasRequesterEmail(r.email);
      const c = await fetchCachedGlpiUserContact(uid);
      if (!c) {
        return r;
      }
      return {
        userId: uid,
        // Preferimos o nome do endpoint /User/:id para trocar logins curtos por nome completo.
        displayName: c.displayName ?? r.displayName,
        email: hasEmail ? r.email : c.email ?? r.email
      };
    })
  );
}
