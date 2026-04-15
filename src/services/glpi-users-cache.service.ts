import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import type { RequesterContact } from "../utils/ticket-requester";
import { glpiClient } from "./glpi.client";

const USERS_CACHE_KEY = "glpi_active_users_cache_v1";
const DAY_MS = 24 * 60 * 60 * 1000;

type CachedUsersPayload = {
  fetchedAtMs: number;
  users: Record<string, { displayName: string | null; email: string | null }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.trunc(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 ? n : null;
  }
  return null;
}

function parseDisplayName(o: Record<string, unknown>): string | null {
  const first = o.name ?? o.completename ?? o.friendlyname ?? o.realname ?? o.login ?? o.username;
  if (typeof first === "string" && first.trim()) return first.trim();
  const fn = o.firstname;
  const ln = o.lastname;
  if (typeof fn === "string" || typeof ln === "string") {
    const joined = [fn, ln].filter(Boolean).join(" ").trim();
    return joined || null;
  }
  return null;
}

function parseEmail(o: Record<string, unknown>): string | null {
  const candidates = [o.email, o.alternative_email, o.default_email, o.user_email, o.mail];
  for (const c of candidates) {
    if (typeof c === "string" && c.includes("@")) return c.trim().toLowerCase();
  }
  return null;
}

function isUserActive(o: Record<string, unknown>): boolean {
  const active = o.is_active ?? o.active;
  const deleted = o.is_deleted ?? o.deleted;
  if (deleted === true || deleted === 1 || deleted === "1") return false;
  if (active === false || active === 0 || active === "0") return false;
  return true;
}

function pickList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const o = asRecord(payload);
  if (Array.isArray(o.data)) return o.data;
  if (Array.isArray(o.items)) return o.items;
  if (Array.isArray(o.results)) return o.results;
  return [];
}

async function fetchUsersWithPath(path: string): Promise<unknown[]> {
  const pageSize = 500;
  const maxPages = 200;
  const all: unknown[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    const attempts = [
      () => glpiClient.get(path, { params: { start, limit: pageSize }, validateStatus: () => true }),
      () => glpiClient.get(path, { params: { page, per_page: pageSize }, validateStatus: () => true }),
      () => glpiClient.get(path, { params: { range: `${start}-${end}` }, validateStatus: () => true }),
      () => glpiClient.get(path, { params: { offset: start, limit: pageSize }, validateStatus: () => true })
    ];
    let pageRows: unknown[] = [];
    let ok = false;
    for (const run of attempts) {
      const res = await run();
      if (res.status >= 200 && res.status < 300) {
        pageRows = pickList(res.data);
        ok = true;
        break;
      }
    }
    if (!ok) break;
    all.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }
  return all;
}

async function fetchAllActiveUsersFromGlpi(): Promise<Map<number, RequesterContact>> {
  const paths = ["/v2/Management/User", "/v2/Management/Users", "/v2/User", "/v2/Users", "/v2/Core/User"];
  for (const path of paths) {
    try {
      const rows = await fetchUsersWithPath(path);
      if (rows.length === 0) continue;
      const map = new Map<number, RequesterContact>();
      for (const row of rows) {
        const o = asRecord(row);
        if (!isUserActive(o)) continue;
        const id = parsePositiveInt(o.id ?? o.users_id ?? o.user_id);
        if (!id) continue;
        map.set(id, { userId: id, displayName: parseDisplayName(o), email: parseEmail(o) });
      }
      if (map.size > 0) {
        logger.info({ path, users: map.size }, "Cache de usuários ativos atualizado a partir do GLPI");
        return map;
      }
    } catch (error) {
      logger.warn({ path, error: String(error) }, "Falha ao carregar usuários ativos no GLPI");
    }
  }
  return new Map();
}

function parseCachePayload(raw: string | null | undefined): CachedUsersPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedUsersPayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.users || typeof parsed.users !== "object") return null;
    if (typeof parsed.fetchedAtMs !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function encodeCachePayload(usersMap: Map<number, RequesterContact>): string {
  const users: CachedUsersPayload["users"] = {};
  for (const [id, u] of usersMap.entries()) {
    users[String(id)] = { displayName: u.displayName ?? null, email: u.email ?? null };
  }
  const payload: CachedUsersPayload = { fetchedAtMs: Date.now(), users };
  return JSON.stringify(payload);
}

export async function ensureActiveUsersCacheFresh(maxAgeMs = DAY_MS): Promise<void> {
  const row = await prisma.syncState.findUnique({ where: { key: USERS_CACHE_KEY } });
  const payload = parseCachePayload(row?.value);
  const age = payload ? Date.now() - payload.fetchedAtMs : Number.POSITIVE_INFINITY;
  if (payload && age >= 0 && age < maxAgeMs) {
    return;
  }
  const usersMap = await fetchAllActiveUsersFromGlpi();
  if (usersMap.size === 0) return;
  await prisma.syncState.upsert({
    where: { key: USERS_CACHE_KEY },
    update: { value: encodeCachePayload(usersMap) },
    create: { key: USERS_CACHE_KEY, value: encodeCachePayload(usersMap) }
  });
}

export async function getCachedUsersByIds(ids: number[]): Promise<Map<number, RequesterContact>> {
  const wanted = Array.from(new Set(ids.filter((x) => Number.isFinite(x) && x > 0)));
  if (wanted.length === 0) return new Map();
  const row = await prisma.syncState.findUnique({ where: { key: USERS_CACHE_KEY } });
  const payload = parseCachePayload(row?.value);
  if (!payload) return new Map();
  const map = new Map<number, RequesterContact>();
  for (const id of wanted) {
    const u = payload.users[String(id)];
    if (!u) continue;
    map.set(id, { userId: id, displayName: u.displayName ?? null, email: u.email ?? null });
  }
  return map;
}
