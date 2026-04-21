import { prisma } from "@/glpi/config/prisma";
import { logger } from "@/glpi/config/logger";
import { glpiClient } from "@/glpi/services/glpi.client";

export type GlpiGroupCatalogRow = { glpiGroupId: number; glpiGroupName: string | null };

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function pickList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const o = asRecord(payload);
  if (Array.isArray(o.data)) return o.data;
  if (Array.isArray(o.items)) return o.items;
  if (Array.isArray(o.results)) return o.results;
  return [];
}

function parseGroupId(o: Record<string, unknown>): number | null {
  const raw = o.id ?? o.groups_id ?? o.group_id;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.trunc(raw);
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return n > 0 ? n : null;
  }
  return null;
}

function parseGroupName(o: Record<string, unknown>): string | null {
  for (const k of ["completename", "name", "friendlyname", "label"] as const) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function isDeleted(o: Record<string, unknown>): boolean {
  const d = o.is_deleted ?? o.deleted;
  return d === true || d === 1 || d === "1";
}

async function fetchAllRowsPaged(path: string): Promise<unknown[]> {
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

async function fetchGroupsFromGlpiApi(): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  const paths = ["/v2/Group", "/v2/Groups", "/v2/Management/Group", "/v2/Core/Group"];
  for (const path of paths) {
    try {
      const rows = await fetchAllRowsPaged(path);
      if (rows.length === 0) continue;
      for (const row of rows) {
        const o = asRecord(row);
        if (isDeleted(o)) continue;
        const id = parseGroupId(o);
        if (id == null) continue;
        const name = parseGroupName(o);
        const prev = map.get(id);
        map.set(id, name ?? prev ?? null);
      }
      logger.info({ path, rows: rows.length, groups: map.size }, "Grupos GLPI fundidos a partir da API");
    } catch (error) {
      logger.warn({ path, error: String(error) }, "Tentativa de listar grupos GLPI falhou");
    }
  }
  return map;
}

async function distinctGroupsFromTickets(): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  const rows = await prisma.ticket.findMany({
    where: { contractGroupId: { not: null } },
    distinct: ["contractGroupId"],
    select: { contractGroupId: true, contractGroupName: true },
    orderBy: [{ contractGroupId: "asc" }]
  });
  for (const row of rows) {
    if (row.contractGroupId == null) continue;
    map.set(row.contractGroupId, row.contractGroupName ?? null);
  }
  return map;
}

/**
 * Opções para vincular contratos a grupos: merge da API GLPI (v2) com grupos já vistos nos chamados em cache.
 */
export async function loadContractGlpiGroupCatalog(): Promise<GlpiGroupCatalogRow[]> {
  const merged = new Map<number, string | null>();

  let fromApi: Map<number, string | null>;
  try {
    fromApi = await fetchGroupsFromGlpiApi();
  } catch {
    fromApi = new Map();
  }
  for (const [id, name] of fromApi) {
    merged.set(id, name);
  }

  const fromTickets = await distinctGroupsFromTickets();
  for (const [id, name] of fromTickets) {
    const prev = merged.get(id);
    merged.set(id, prev && prev.trim() ? prev : name);
  }

  return Array.from(merged.entries())
    .map(([glpiGroupId, glpiGroupName]) => ({ glpiGroupId, glpiGroupName }))
    .sort((a, b) => {
      const la = (a.glpiGroupName ?? `#${a.glpiGroupId}`).toLocaleLowerCase("pt-BR");
      const lb = (b.glpiGroupName ?? `#${b.glpiGroupId}`).toLocaleLowerCase("pt-BR");
      return la.localeCompare(lb, "pt-BR");
    });
}
