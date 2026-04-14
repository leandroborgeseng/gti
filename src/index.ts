import http from "node:http";
import cron from "node-cron";
import { AxiosError } from "axios";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./config/prisma";
import { syncTickets, SyncProgress, SyncTicketsResult } from "./jobs/sync-tickets.job";
import { ensureSqliteSchema } from "./scripts/bootstrap-db";
import { loadOpenApiSpec } from "./services/openapi.loader";
import { getAccessToken } from "./services/auth.service";
import { loadTicketHistoryFromGlpi } from "./services/glpi-ticket-history.service";
import { fetchGlpiTicketJson, patchGlpiTicketJson } from "./services/glpi-ticket-write.service";
import { persistTicketFromRaw } from "./services/ticket-persist.service";
import { extractGlpiScalarId } from "./utils/glpi-field-parse";
import { ticketWhereNotClosed } from "./utils/ticket-status";

let isSyncRunning = false;
type SyncRuntimeStatus = {
  isRunning: boolean;
  runs: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastLoaded: number;
  lastSaved: number;
  lastFailed: number;
  lastPage: number;
};

const syncStatus: SyncRuntimeStatus = {
  isRunning: false,
  runs: 0,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastLoaded: 0,
  lastSaved: 0,
  lastFailed: 0,
  lastPage: 0
};

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function asJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Idade a partir de uma data ISO (criação ou última modificação GLPI). */
function formatTicketAge(iso: string | null | undefined, end: Date): string {
  if (!iso) {
    return "—";
  }
  const start = Date.parse(iso);
  if (Number.isNaN(start)) {
    return "—";
  }
  const ms = Math.max(0, end.getTime() - start);
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) {
    return `${days} dia${days === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) {
    return `${hours} h`;
  }
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins} min`;
}

const KANBAN_SETTINGS_KEY = "kanban_settings";

type KanbanSettings = {
  columnOrder?: string[];
  columnColors?: Record<string, string>;
};

function hashStringToUint32(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hslFromSeed(seed: string, saturation: number, lightness: number): string {
  const hue = hashStringToUint32(seed) % 360;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function columnChromeStyle(statusKey: string): string {
  const bg = hslFromSeed(`col:${statusKey}`, 78, 88);
  const border = hslFromSeed(`colb:${statusKey}`, 62, 62);
  return `--col-bg:${bg};--col-border:${border};`;
}

function cardChromeStyle(ticketSeed: string): string {
  const bg = hslFromSeed(`card:${ticketSeed}`, 82, 94);
  const border = hslFromSeed(`cardb:${ticketSeed}`, 58, 72);
  return `background:${bg};border-color:${border};`;
}

function sanitizeCssColor(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%(\s*,\s*[\d.]+)?\s*\)$/.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

function mergeColumnOrder(saved: string[] | undefined, discovered: string[]): string[] {
  const cleaned = (saved || []).filter((item) => discovered.includes(item));
  const tail = discovered.filter((item) => !cleaned.includes(item));
  return [...cleaned, ...tail];
}

async function readKanbanSettings(): Promise<KanbanSettings> {
  const row = await prisma.syncState.findUnique({ where: { key: KANBAN_SETTINGS_KEY } });
  if (!row?.value) {
    return {};
  }
  try {
    const parsed = JSON.parse(row.value) as KanbanSettings;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const sanitized: KanbanSettings = { ...parsed };
    if (sanitized.columnColors) {
      const nextColors: Record<string, string> = {};
      for (const [key, value] of Object.entries(sanitized.columnColors)) {
        if (typeof value !== "string") {
          continue;
        }
        const safe = sanitizeCssColor(value);
        if (safe) {
          nextColors[key] = safe;
        }
      }
      sanitized.columnColors = nextColors;
    }
    return sanitized;
  } catch {
    return {};
  }
}

async function writeKanbanSettings(settings: KanbanSettings): Promise<void> {
  await prisma.syncState.upsert({
    where: { key: KANBAN_SETTINGS_KEY },
    update: { value: JSON.stringify(settings) },
    create: { key: KANBAN_SETTINGS_KEY, value: JSON.stringify(settings) }
  });
}

async function readRequestBody(req: http.IncomingMessage, maxBytes = 256_000): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error("Payload muito grande");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo"
  }).format(date);
}

function applySyncProgress(progress: SyncProgress): void {
  syncStatus.lastPage = progress.page;
  syncStatus.lastLoaded = progress.loaded;
  syncStatus.lastSaved = progress.saved;
  syncStatus.lastFailed = progress.failed;
}

function toErrorLog(error: unknown): { message: string; stack?: string } {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const method = error.config?.method?.toUpperCase();
    const url = error.config?.url;
    const responseText =
      typeof error.response?.data === "string"
        ? error.response.data
        : error.response?.data
        ? JSON.stringify(error.response.data)
        : "";

    return {
      message: `[HTTP] ${method || "?"} ${url || "?"} -> ${status || "sem_status"} ${responseText}`.trim(),
      stack: error.stack
    };
  }

  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function startHealthServer(): void {
  const server = http.createServer(async (req, res) => {
    const method = req.method || "GET";
    const host = req.headers.host || `localhost:${env.PORT}`;
    const parsedUrl = new URL(req.url || "/", `http://${host}`);

    if (method === "GET" && parsedUrl.pathname === "/api/kanban") {
      try {
        const settings = await readKanbanSettings();
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(settings));
      } catch (error) {
        logger.error({ error: toErrorLog(error) }, "Falha ao ler configuracao do kanban");
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Falha ao ler configuracao do kanban" }));
      }
      return;
    }

    if (method === "POST" && parsedUrl.pathname === "/api/kanban") {
      try {
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody) as unknown;
        if (!body || typeof body !== "object") {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "JSON invalido" }));
          return;
        }
        const incoming = body as KanbanSettings;
        const current = await readKanbanSettings();
        const next: KanbanSettings = { ...current };
        if (Array.isArray(incoming.columnOrder)) {
          next.columnOrder = incoming.columnOrder.filter((item) => typeof item === "string");
        }
        if (incoming.columnColors && typeof incoming.columnColors === "object") {
          const merged: Record<string, string> = { ...(next.columnColors || {}) };
          for (const [key, value] of Object.entries(incoming.columnColors)) {
            if (typeof key === "string" && typeof value === "string" && value.trim().length > 0) {
              const safe = sanitizeCssColor(value);
              if (safe) {
                merged[key] = safe;
              }
            }
          }
          next.columnColors = merged;
        }
        await writeKanbanSettings(next);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(next));
      } catch (error) {
        logger.error({ error: toErrorLog(error) }, "Falha ao salvar configuracao do kanban");
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Falha ao salvar configuracao do kanban" }));
      }
      return;
    }

    const glpiTicketApiMatch = parsedUrl.pathname.match(/^\/api\/tickets\/glpi\/(\d+)$/);
    if (glpiTicketApiMatch) {
      const glpiId = Number(glpiTicketApiMatch[1]);
      if (!Number.isFinite(glpiId) || glpiId < 1) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "ID invalido" }));
        return;
      }

      if (method === "GET") {
        try {
          const ticket = await prisma.ticket.findUnique({
            where: { glpiTicketId: glpiId },
            select: {
              glpiTicketId: true,
              title: true,
              content: true,
              status: true,
              priority: true,
              dateCreation: true,
              dateModification: true,
              contractGroupName: true,
              rawJson: true
            }
          });
          if (!ticket) {
            res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: "Chamado nao encontrado no cache local" }));
            return;
          }
          const raw = asJsonRecord(ticket.rawJson);
          const history = await loadTicketHistoryFromGlpi(glpiId, ticket.status);
          const payload = {
            glpiTicketId: ticket.glpiTicketId,
            name: ticket.title ?? "",
            content: ticket.content ?? "",
            statusLabel: ticket.status,
            priorityLabel: ticket.priority,
            statusId: extractGlpiScalarId(raw.status),
            priorityId: extractGlpiScalarId(raw.priority),
            dateCreation: ticket.dateCreation,
            dateModification: ticket.dateModification,
            contractGroupName: ticket.contractGroupName,
            history
          };
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(payload));
        } catch (error) {
          logger.error({ error: toErrorLog(error) }, "Falha ao carregar ticket para API");
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Falha ao carregar ticket" }));
        }
        return;
      }

      if (method === "PATCH") {
        try {
          const rawBody = await readRequestBody(req);
          const body = JSON.parse(rawBody) as Record<string, unknown>;
          const patch: Record<string, unknown> = {};
          if (typeof body.name === "string") {
            patch.name = body.name;
          }
          if (typeof body.content === "string") {
            patch.content = body.content;
          }
          if (body.statusId !== undefined && body.statusId !== null && body.statusId !== "") {
            const n = Number(body.statusId);
            if (Number.isFinite(n)) {
              patch.status = n;
            }
          }
          if (body.priorityId !== undefined && body.priorityId !== null && body.priorityId !== "") {
            const n = Number(body.priorityId);
            if (Number.isFinite(n)) {
              patch.priority = n;
            }
          }
          if (Object.keys(patch).length === 0) {
            res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: "Nenhum campo para atualizar" }));
            return;
          }
          await patchGlpiTicketJson(glpiId, patch);
          const fresh = await fetchGlpiTicketJson(glpiId);
          await persistTicketFromRaw(fresh);
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          logger.error({ error: toErrorLog(error) }, "Falha ao atualizar ticket no GLPI");
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Falha ao atualizar chamado no GLPI", detail: toErrorLog(error).message }));
        }
        return;
      }

      res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      return;
    }

    if (method === "GET" && parsedUrl.pathname === "/") {
      const q = (parsedUrl.searchParams.get("q") || "").trim();
      const statusFilter = (parsedUrl.searchParams.get("status") || "").trim();
      const groupFilter = (parsedUrl.searchParams.get("group") || "").trim();
      const assignedGroupFilter = (parsedUrl.searchParams.get("assignedGroup") || "").trim();
      const onlyOpen = parsedUrl.searchParams.get("open") === "1";
      let latestTickets: Array<{
        glpiTicketId: number;
        title: string | null;
        status: string | null;
        contractGroupName: string | null;
        dateCreation: string | null;
        dateModification: string | null;
        updatedAt: Date;
      }> = [];
      let statuses: string[] = [];
      let groups: string[] = [];
      let syncedTotal = 0;
      let filteredTotal = 0;
      let glpiRemoteTotal: number | null = null;
      let kanbanSettings: KanbanSettings = {};
      try {
        const assignedGroupTicketIds =
          assignedGroupFilter.trim().length > 0
            ? (
                await prisma.ticketAttribute.findMany({
                  where: {
                    OR: [
                      { keyPath: { contains: "team" } },
                      { keyPath: { contains: "group" } },
                      { keyPath: { contains: "assigned" } }
                    ],
                    AND: [
                      {
                        OR: [
                          { valueText: { contains: assignedGroupFilter } },
                          { valueJson: { contains: assignedGroupFilter } }
                        ]
                      }
                    ]
                  },
                  select: { ticketId: true },
                  distinct: ["ticketId"],
                  take: 5000
                })
              ).map((row) => row.ticketId)
            : [];

        const where = {
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
            statusFilter ? { status: statusFilter } : {},
            groupFilter ? { contractGroupName: { contains: groupFilter } } : {},
            assignedGroupFilter
              ? {
                  OR: [
                    { contractGroupName: { contains: assignedGroupFilter } },
                    ...(assignedGroupTicketIds.length > 0 ? [{ id: { in: assignedGroupTicketIds } }] : [])
                  ]
                }
              : {},
            ...(onlyOpen ? [ticketWhereNotClosed()] : [])
          ]
        };

        const [totalDb, totalFiltered, glpiTotalRow, kanbanStored] = await Promise.all([
          prisma.ticket.count(),
          prisma.ticket.count({ where }),
          prisma.syncState.findUnique({ where: { key: "glpi_ticket_total" } }),
          readKanbanSettings()
        ]);
        syncedTotal = totalDb;
        filteredTotal = totalFiltered;
        kanbanSettings = kanbanStored;
        if (glpiTotalRow?.value) {
          const parsedTotal = Number(glpiTotalRow.value);
          glpiRemoteTotal = Number.isFinite(parsedTotal) ? parsedTotal : null;
        }

        latestTickets = await prisma.ticket.findMany({
          where,
          orderBy: [{ dateCreation: "asc" }, { glpiTicketId: "asc" }],
          take: 200,
          select: {
            glpiTicketId: true,
            title: true,
            status: true,
            contractGroupName: true,
            dateCreation: true,
            dateModification: true,
            updatedAt: true
          }
        });
        const statusRows = await prisma.ticket.findMany({
          where: { status: { not: null } },
          distinct: ["status"],
          select: { status: true },
          orderBy: { status: "asc" }
        });
        statuses = statusRows.map((item) => item.status).filter((item): item is string => Boolean(item));
        const groupRows = await prisma.ticket.findMany({
          where: { contractGroupName: { not: null } },
          distinct: ["contractGroupName"],
          select: { contractGroupName: true },
          orderBy: { contractGroupName: "asc" }
        });
        groups = groupRows.map((item) => item.contractGroupName).filter((item): item is string => Boolean(item));
      } catch (error) {
        logger.error({ error: toErrorLog(error) }, "Falha ao carregar dados da pagina inicial");
      }

      const ticketsByStatus = new Map<
        string,
        Array<{
          glpiTicketId: number;
          title: string | null;
          status: string | null;
          contractGroupName: string | null;
          dateCreation: string | null;
          dateModification: string | null;
          updatedAt: Date;
        }>
      >();
      for (const ticket of latestTickets) {
        const key = ticket.status || "Sem status";
        const existing = ticketsByStatus.get(key) || [];
        existing.push(ticket);
        ticketsByStatus.set(key, existing);
      }
      const compareTicketsInColumn = (
        a: {
          glpiTicketId: number;
          dateCreation: string | null;
          dateModification: string | null;
        },
        b: {
          glpiTicketId: number;
          dateCreation: string | null;
          dateModification: string | null;
        }
      ): number => {
        const da = Date.parse(a.dateCreation || "") || Date.parse(a.dateModification || "") || 0;
        const db = Date.parse(b.dateCreation || "") || Date.parse(b.dateModification || "") || 0;
        if (da !== db) {
          return da - db;
        }
        return a.glpiTicketId - b.glpiTicketId;
      };
      for (const arr of ticketsByStatus.values()) {
        arr.sort(compareTicketsInColumn);
      }

      const discoveredStatusKeys = Array.from(new Set([...statuses, ...Array.from(ticketsByStatus.keys())]));
      const orderedStatusKeys = mergeColumnOrder(kanbanSettings.columnOrder, discoveredStatusKeys);
      const now = new Date();

      const buildColumnInlineStyle = (statusKey: string): string => {
        const override = kanbanSettings.columnColors?.[statusKey];
        if (override) {
          const border = hslFromSeed(`colsav:${statusKey}`, 55, 72);
          return `--col-bg:${override};--col-border:${border};`;
        }
        return columnChromeStyle(statusKey);
      };

      const kanbanColumnsHtml = orderedStatusKeys
        .map((statusKey) => {
          const cards = ticketsByStatus.get(statusKey) || [];
          const columnStyle = buildColumnInlineStyle(statusKey);
          const cardsHtml = cards
            .map((ticket) => {
              const safeTitle = escapeHtml(ticket.title || "(sem titulo)");
              const safeGroup = escapeHtml(ticket.contractGroupName || "-");
              const cardStyle = cardChromeStyle(String(ticket.glpiTicketId));
              const openFor = formatTicketAge(ticket.dateCreation, now);
              const idleFor = formatTicketAge(ticket.dateModification || ticket.dateCreation, now);
              return `<div class="kanban-card" draggable="false" role="button" tabindex="0" data-glpi-id="${
                ticket.glpiTicketId
              }" style="${escapeHtml(cardStyle)}">
                <div><strong>#${ticket.glpiTicketId}</strong></div>
                <div>${safeTitle}</div>
                <div class="small">Grupo: ${safeGroup}</div>
                <div class="small">Aberto há: <strong>${escapeHtml(openFor)}</strong> (desde criação)</div>
                <div class="small">Sem interação há: <strong>${escapeHtml(idleFor)}</strong> (última alteração GLPI)</div>
                <div class="small">Últ. mod GLPI: ${formatDateTime(ticket.dateModification)}</div>
                <div class="small">Sync local: ${formatDateTime(ticket.updatedAt)}</div>
              </div>`;
            })
            .join("");
          return `<div class="kanban-column" data-status="${escapeHtml(statusKey)}" style="${escapeHtml(columnStyle)}">
            <div class="kanban-column-handle" draggable="true">
              <h3>${escapeHtml(statusKey)} <span class="small">(${cards.length})</span></h3>
            </div>
            <div class="kanban-column-body">
              ${cardsHtml || '<div class="small">(sem chamados)</div>'}
            </div>
          </div>`;
        })
        .join("");
      const statusOptions = statuses
        .map((item) => `<option value="${escapeHtml(item)}" ${item === statusFilter ? "selected" : ""}>${escapeHtml(item)}</option>`)
        .join("");
      const groupOptions = groups
        .map((item) => `<option value="${escapeHtml(item)}" ${item === groupFilter ? "selected" : ""}>${escapeHtml(item)}</option>`)
        .join("");

      const remaining =
        glpiRemoteTotal !== null && glpiRemoteTotal >= 0 ? Math.max(glpiRemoteTotal - syncedTotal, 0) : null;
      const remoteLabel =
        glpiRemoteTotal === null
          ? "Total remoto GLPI ainda nao disponivel (aparece apos a primeira pagina com header Content-Range)."
          : String(glpiRemoteTotal);
      const remainingLabel = remaining === null ? "—" : String(remaining);

      const filterLines: string[] = [];
      filterLines.push(
        `<div><span class="chip">Busca:</span> ${q ? escapeHtml(q) : '<span class="muted">(vazio)</span>'}</div>`
      );
      filterLines.push(
        `<div><span class="chip">Status:</span> ${
          statusFilter ? escapeHtml(statusFilter) : '<span class="muted">(todos)</span>'
        }</div>`
      );
      filterLines.push(
        `<div><span class="chip">Grupo:</span> ${
          groupFilter ? escapeHtml(groupFilter) : '<span class="muted">(todos)</span>'
        }</div>`
      );
      filterLines.push(
        `<div><span class="chip">Grupo tecnico atribuido:</span> ${
          assignedGroupFilter ? escapeHtml(assignedGroupFilter) : '<span class="muted">(vazio)</span>'
        }</div>`
      );
      filterLines.push(`<div><span class="chip">Somente abertos:</span> ${onlyOpen ? "Sim" : "Nao"}</div>`);

      const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chamados GLPI</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; color: #222; }
      h1 { margin-bottom: 0.5rem; }
      code { background: #f5f5f5; padding: 0.15rem 0.35rem; border-radius: 4px; }
      ul { line-height: 1.8; }
      .muted { color: #666; font-size: 0.95rem; }
      .dashboard { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.75rem; margin: 1rem 0; }
      .metric { border: 1px solid #e2e2e2; border-radius: 10px; padding: 0.75rem; background: #fafafa; }
      .metric strong { display: block; font-size: 1.35rem; margin-bottom: 0.25rem; }
      .filters { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: end; margin: 1rem 0; }
      .filters label { font-size: 0.9rem; display: flex; flex-direction: column; gap: 0.35rem; }
      .filters input, .filters select { padding: 0.35rem 0.5rem; min-width: 180px; }
      .filters button { padding: 0.45rem 0.75rem; }
      .section-title { margin-top: 2rem; margin-bottom: 0.5rem; }
      .small { font-size: 12px; color: #666; }
      .filter-summary { border: 1px dashed #cfcfcf; border-radius: 10px; padding: 0.75rem; margin: 0.75rem 0 1rem 0; background: #fff; }
      .filter-summary h2 { margin: 0 0 0.5rem 0; font-size: 1rem; }
      .filter-lines { display: grid; gap: 0.35rem; font-size: 0.95rem; }
      .chip { display: inline-block; padding: 0.1rem 0.45rem; border-radius: 999px; background: #eef2ff; color: #1f2a5c; font-size: 0.8rem; margin-right: 0.35rem; }
      .kanban-board { display: flex; flex-wrap: wrap; gap: 0.8rem; margin-top: 1rem; align-items: flex-start; }
      .kanban-column { flex: 1 1 280px; max-width: 420px; border: 1px solid var(--col-border, #ddd); border-radius: 10px; padding: 0; background: var(--col-bg, #fafafa); min-height: 120px; overflow: hidden; }
      .kanban-column.dragging { opacity: 0.65; }
      .kanban-column-handle { padding: 0.65rem; cursor: grab; background: rgba(255,255,255,0.35); border-bottom: 1px solid rgba(0,0,0,0.06); }
      .kanban-column-handle:active { cursor: grabbing; }
      .kanban-column h3 { margin: 0; font-size: 14px; }
      .kanban-column-body { padding: 0.65rem; }
      .kanban-card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 0.5rem; margin-bottom: 0.5rem; display: flex; flex-direction: column; gap: 0.2rem; cursor: pointer; text-align: left; }
      .kanban-card:hover { filter: brightness(0.98); }
      .kanban-card:focus { outline: 2px solid #3b5bdb; outline-offset: 2px; }
      .modal { display: none; position: fixed; inset: 0; z-index: 50; align-items: center; justify-content: center; padding: 1rem; }
      .modal.open { display: flex; }
      .modal-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.45); }
      .modal-panel { position: relative; z-index: 1; width: min(760px, 100%); max-height: 90vh; overflow: auto; background: #fff; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.2); padding: 0; }
      .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1rem 0.5rem 1rem; border-bottom: 1px solid #eee; }
      .modal-header h2 { margin: 0; font-size: 1.1rem; }
      .modal-close { border: none; background: transparent; font-size: 1.5rem; line-height: 1; cursor: pointer; color: #555; }
      #ticket-edit-form { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
      .modal-field { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.9rem; }
      .modal-field input, .modal-field textarea { padding: 0.45rem 0.55rem; font: inherit; }
      .modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
      @media (max-width: 560px) { .modal-grid { grid-template-columns: 1fr; } }
      .modal-hint { margin: 0; }
      .modal-error { margin: 0; color: #b00020; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
      .btn-secondary { padding: 0.45rem 0.85rem; border: 1px solid #ccc; background: #f5f5f5; border-radius: 6px; cursor: pointer; }
      #ticket-edit-submit { padding: 0.45rem 0.85rem; border: none; background: #3b5bdb; color: #fff; border-radius: 6px; cursor: pointer; }
      #ticket-edit-submit:disabled { opacity: 0.6; cursor: not-allowed; }
      .modal-field-rich .ticket-quill-editor { border: 1px solid #ccc; border-radius: 6px; overflow: hidden; background: #fff; }
      .modal-field-rich .ql-toolbar { border: none; border-bottom: 1px solid #e0e0e0; font-family: Arial, sans-serif; }
      .modal-field-rich .ql-container { border: none; font-size: 14px; font-family: Arial, Helvetica, sans-serif; }
      .modal-field-rich .ql-editor { min-height: 220px; max-height: 45vh; overflow-y: auto; }
      .modal-field-rich .ql-editor.ql-blank::before { font-style: normal; color: #999; }
      #ticket-history-section { margin-top: 0.25rem; }
      .waiting-banner { padding: 0.65rem 0.85rem; border-radius: 8px; margin-bottom: 0.75rem; font-size: 0.92rem; line-height: 1.4; }
      .waiting-banner strong { display: block; margin-bottom: 0.25rem; }
      .waiting-banner.waiting-empresa { background: #e8f4ff; border: 1px solid #7eb8e8; }
      .waiting-banner.waiting-cliente { background: #fff8e6; border: 1px solid #e6c35c; }
      .waiting-banner.waiting-unknown { background: #f3f3f3; border: 1px solid #ccc; }
      .waiting-banner.waiting-na { background: #eef0f2; border: 1px solid #cfd4da; color: #444; }
      .history-heading { margin: 0 0 0.4rem 0; font-size: 0.95rem; }
      .history-list { max-height: 38vh; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 0.35rem 0.5rem; background: #fafafa; }
      .history-item { border-bottom: 1px solid #e8e8e8; padding: 0.55rem 0.25rem; }
      .history-item:last-child { border-bottom: none; }
      .history-meta { font-size: 12px; color: #555; margin-bottom: 0.35rem; }
      .history-body { font-size: 14px; line-height: 1.45; }
      .history-body img { max-width: 100%; height: auto; }
      #ticket-history-api-error { color: #a15c00; margin: 0 0 0.5rem 0; }
    </style>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css" crossorigin="anonymous" />
  </head>
  <body>
    <h1>Chamados</h1>
    <p class="muted">Cache local (SQLite): sincronizamos apenas chamados <strong>abertos</strong> (fechados/solucionados nao entram no banco). Categorias e filtros refletem o que ja foi carregado.</p>

    <div class="dashboard">
      <div class="metric">
        <strong>${syncedTotal}</strong>
        <span class="small">Chamados no banco (cache)</span>
      </div>
      <div class="metric">
        <strong>${escapeHtml(remoteLabel)}</strong>
        <span class="small">Total remoto GLPI (quando disponivel)</span>
      </div>
      <div class="metric">
        <strong>${escapeHtml(remainingLabel)}</strong>
        <span class="small">Falta sincronizar (estimado)</span>
      </div>
      <div class="metric">
        <strong>${filteredTotal}</strong>
        <span class="small">Resultado do filtro atual (contagem no SQLite)</span>
      </div>
      <div class="metric">
        <strong>${latestTickets.length}</strong>
        <span class="small">Cards no quadro (ate 200 do filtro, mais antigos primeiro em cada coluna)</span>
      </div>
      <div class="metric">
        <strong>${syncStatus.isRunning ? "Rodando" : "Parado"}</strong>
        <span class="small">Sincronizacao GLPI — pagina ${syncStatus.lastPage || 0}, carregados ${syncStatus.lastLoaded || 0}, gravados ${
          syncStatus.lastSaved || 0
        }</span>
      </div>
    </div>

    <div class="filter-summary">
      <h2>Filtros aplicados</h2>
      <div class="filter-lines">
        ${filterLines.join("")}
      </div>
    </div>

    <form class="filters" method="GET" action="/">
      <label>Busca
        <input type="text" name="q" value="${escapeHtml(q)}" placeholder="ID, titulo ou conteudo" />
      </label>
      <label>Status
        <select name="status">
          <option value="">(todos)</option>
          ${statusOptions}
        </select>
      </label>
      <label>Grupo
        <select name="group">
          <option value="">(todos)</option>
          ${groupOptions}
        </select>
      </label>
      <label>Grupo tecnico atribuido (busca)
        <input type="text" name="assignedGroup" value="${escapeHtml(assignedGroupFilter)}" placeholder="ex.: Helpdesk, Software de terceiros" />
      </label>
      <label>Somente abertos
        <select name="open">
          <option value="0" ${onlyOpen ? "" : "selected"}>Nao</option>
          <option value="1" ${onlyOpen ? "selected" : ""}>Sim</option>
        </select>
      </label>
      <button type="submit">Filtrar</button>
    </form>
    <h2 class="section-title">Kanban de chamados por status</h2>
    <p class="small">Arraste pelo <strong>título da coluna</strong> para reordenar (salvo no SQLite). Clique no card para editar no GLPI.</p>
    <div class="kanban-board" id="kanban-board">
      ${kanbanColumnsHtml || '<div class="small">(nenhum ticket sincronizado ainda)</div>'}
    </div>

    <div id="ticket-modal" class="modal" aria-hidden="true">
      <div class="modal-backdrop" data-close-modal></div>
      <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="ticket-modal-title">
        <div class="modal-header">
          <h2 id="ticket-modal-title">Editar chamado</h2>
          <button type="button" class="modal-close" data-close-modal aria-label="Fechar">&times;</button>
        </div>
        <form id="ticket-edit-form">
          <input type="hidden" id="ticket-edit-glpi-id" />
          <label class="modal-field">Título (GLPI <code>name</code>)
            <input type="text" id="ticket-edit-name" required />
          </label>
          <label class="modal-field modal-field-rich">Descrição (rich text / HTML — enviado como <code>content</code> no GLPI)
            <div id="ticket-edit-quill" class="ticket-quill-editor" aria-label="Descrição formatada"></div>
          </label>
          <div id="ticket-history-section">
            <div id="ticket-waiting-banner" class="waiting-banner" hidden></div>
            <p class="small" id="ticket-history-api-error" hidden></p>
            <h3 class="history-heading">Histórico do chamado (GLPI)</h3>
            <p class="small" style="margin: 0 0 0.5rem 0;">Linha do tempo: abertura, acompanhamentos e tarefas. O indicador de <strong>quem deve responder</strong> usa a última entrada <strong>pública</strong> — se o autor for o solicitante, a <strong>empresa</strong> deve agir; se for técnico/equipe, em geral aguarda o <strong>cliente</strong>. Entradas privadas não entram nessa inferência.</p>
            <div id="ticket-history-list" class="history-list" aria-live="polite"></div>
          </div>
          <div class="modal-grid">
            <label class="modal-field">Status (ID numérico no GLPI)
              <input type="number" id="ticket-edit-status-id" min="0" step="1" placeholder="ex.: 2" />
            </label>
            <label class="modal-field">Prioridade (ID numérico no GLPI)
              <input type="number" id="ticket-edit-priority-id" min="0" step="1" placeholder="ex.: 3" />
            </label>
          </div>
          <p class="small modal-hint">Rótulos atuais: <span id="ticket-edit-labels"></span></p>
          <p class="small modal-error" id="ticket-edit-error" hidden></p>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" id="ticket-edit-submit">Salvar no GLPI</button>
          </div>
        </form>
      </div>
    </div>

    <script>
      (function () {
        const board = document.getElementById("kanban-board");
        if (!board) return;

        let dragEl = null;

        function readOrder() {
          return Array.from(board.querySelectorAll(".kanban-column")).map((col) => col.getAttribute("data-status") || "");
        }

        async function persist(order) {
          try {
            await fetch("/api/kanban", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ columnOrder: order })
            });
          } catch (e) {
            console.warn("Falha ao salvar ordem do kanban", e);
          }
        }

        board.addEventListener("dragstart", (event) => {
          const handle = event.target && event.target.closest ? event.target.closest(".kanban-column-handle") : null;
          if (!handle || !board.contains(handle)) return;
          const column = handle.closest(".kanban-column");
          if (!column || !board.contains(column)) return;
          dragEl = column;
          column.classList.add("dragging");
          event.dataTransfer.effectAllowed = "move";
          try {
            event.dataTransfer.setData("text/plain", column.getAttribute("data-status") || "");
          } catch (_) {}
        });

        board.addEventListener("dragend", (event) => {
          const column = event.target && event.target.closest ? event.target.closest(".kanban-column") : null;
          if (column) {
            column.classList.remove("dragging");
          }
          dragEl = null;
        });

        board.addEventListener("dragover", (event) => {
          if (dragEl) {
            event.preventDefault();
          }
          const column = event.target && event.target.closest ? event.target.closest(".kanban-column") : null;
          if (!column || !board.contains(column) || !dragEl || column === dragEl) {
            return;
          }
          const rect = column.getBoundingClientRect();
          const before = event.clientX < rect.left + rect.width / 2;
          if (before) {
            board.insertBefore(dragEl, column);
          } else {
            board.insertBefore(dragEl, column.nextSibling);
          }
        });

        board.addEventListener("drop", (event) => {
          event.preventDefault();
          const order = readOrder().filter(Boolean);
          void persist(order);
        });
      })();
    </script>
    <script src="https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js" crossorigin="anonymous"></script>
    <script>
      (function () {
        const modal = document.getElementById("ticket-modal");
        const form = document.getElementById("ticket-edit-form");
        const elId = document.getElementById("ticket-edit-glpi-id");
        const elName = document.getElementById("ticket-edit-name");
        const elQuillHost = document.getElementById("ticket-edit-quill");
        const elStatusId = document.getElementById("ticket-edit-status-id");
        const elPriorityId = document.getElementById("ticket-edit-priority-id");
        const elLabels = document.getElementById("ticket-edit-labels");
        const elError = document.getElementById("ticket-edit-error");
        const board = document.getElementById("kanban-board");
        if (!modal || !form || !elId || !elName || !elQuillHost || !elStatusId || !elPriorityId || !elLabels || !elError || !board) return;

        let quillInstance = null;
        function ensureQuill() {
          if (typeof Quill === "undefined") {
            return null;
          }
          if (quillInstance) {
            return quillInstance;
          }
          quillInstance = new Quill("#ticket-edit-quill", {
            theme: "snow",
            modules: {
              toolbar: [
                [{ header: [1, 2, 3, false] }],
                ["bold", "italic", "underline", "strike"],
                [{ list: "ordered" }, { list: "bullet" }],
                [{ indent: "-1" }, { indent: "+1" }],
                ["blockquote", "code-block"],
                ["link"],
                [{ color: [] }, { background: [] }],
                ["clean"]
              ]
            },
            placeholder: "Descreva o chamado..."
          });
          return quillInstance;
        }
        function setQuillHtml(html) {
          const q = ensureQuill();
          if (!q) {
            return false;
          }
          q.setContents([], "silent");
          q.clipboard.dangerouslyPasteHTML(html || "");
          return true;
        }
        function getQuillHtml() {
          if (!quillInstance) {
            return "";
          }
          return quillInstance.root.innerHTML;
        }

        function setError(msg) {
          if (!msg) {
            elError.hidden = true;
            elError.textContent = "";
            return;
          }
          elError.hidden = false;
          elError.textContent = msg;
        }

        function openModal() {
          modal.classList.add("open");
          modal.setAttribute("aria-hidden", "false");
        }

        function closeModal() {
          modal.classList.remove("open");
          modal.setAttribute("aria-hidden", "true");
          setError("");
        }

        modal.addEventListener("click", (e) => {
          const t = e.target;
          if (t && t.closest && t.closest("[data-close-modal]")) {
            closeModal();
          }
        });

        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && modal.classList.contains("open")) {
            closeModal();
          }
        });

        const historyListEl = document.getElementById("ticket-history-list");
        const waitingBannerEl = document.getElementById("ticket-waiting-banner");
        const historyErrEl = document.getElementById("ticket-history-api-error");

        function renderHistory(h) {
          if (!waitingBannerEl || !historyListEl || !historyErrEl) {
            return;
          }
          historyErrEl.hidden = true;
          historyErrEl.textContent = "";
          historyListEl.innerHTML = "";
          if (!h) {
            waitingBannerEl.hidden = true;
            waitingBannerEl.textContent = "";
            waitingBannerEl.className = "waiting-banner";
            return;
          }
          if (h.historyError) {
            historyErrEl.textContent = "Aviso ao carregar historico GLPI: " + h.historyError;
            historyErrEl.hidden = false;
          }
          waitingBannerEl.hidden = false;
          waitingBannerEl.className = "waiting-banner waiting-" + (h.waitingOn || "unknown");
          waitingBannerEl.textContent = "";
          const strong = document.createElement("strong");
          strong.textContent = h.waitingLabel || "";
          waitingBannerEl.appendChild(strong);
          const det = document.createElement("span");
          det.className = "small";
          det.style.display = "block";
          det.style.marginTop = "0.35rem";
          det.textContent = h.waitingDetail || "";
          waitingBannerEl.appendChild(det);
          (h.items || []).forEach(function (item) {
            const art = document.createElement("article");
            art.className = "history-item";
            const meta = document.createElement("div");
            meta.className = "history-meta";
            let line = (item.title || item.kind || "") + " · " + (item.date || "—") + " · ";
            line += item.authorLabel || (item.usersId ? "User #" + item.usersId : "Autor nao identificado");
            if (item.isPrivate) {
              line += " [Privado]";
            }
            meta.textContent = line;
            const bodyWrap = document.createElement("div");
            bodyWrap.className = "history-body ql-snow";
            const inner = document.createElement("div");
            inner.className = "ql-editor";
            inner.innerHTML = item.contentHtml || "";
            bodyWrap.appendChild(inner);
            art.appendChild(meta);
            art.appendChild(bodyWrap);
            historyListEl.appendChild(art);
          });
        }

        async function loadTicket(glpiId) {
          setError("");
          elName.value = "";
          elStatusId.value = "";
          elPriorityId.value = "";
          elLabels.textContent = "";
          renderHistory(null);
          const res = await fetch("/api/tickets/glpi/" + glpiId);
          const data = await res.json().catch(function () { return null; });
          if (!res.ok) {
            setError((data && data.error) || "Falha ao carregar chamado");
            return;
          }
          elId.value = String(data.glpiTicketId);
          elName.value = data.name || "";
          if (data.statusId != null && data.statusId !== "") {
            elStatusId.value = String(data.statusId);
          }
          if (data.priorityId != null && data.priorityId !== "") {
            elPriorityId.value = String(data.priorityId);
          }
          elLabels.textContent =
            "status: " + (data.statusLabel || "—") + " | prioridade: " + (data.priorityLabel || "—");
          renderHistory(data.history || null);
          openModal();
          requestAnimationFrame(function () {
            if (typeof Quill === "undefined") {
              setError("Editor rich text (Quill) nao carregou. Verifique rede / bloqueio de CDN.");
              return;
            }
            if (!setQuillHtml(data.content || "")) {
              setError("Nao foi possivel iniciar o editor.");
              return;
            }
            elName.focus();
          });
        }

        board.addEventListener("click", (e) => {
          const card = e.target && e.target.closest ? e.target.closest(".kanban-card") : null;
          if (!card || !board.contains(card)) return;
          const id = card.getAttribute("data-glpi-id");
          if (!id) return;
          void loadTicket(id);
        });

        board.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          const card = e.target && e.target.closest ? e.target.closest(".kanban-card") : null;
          if (!card || !board.contains(card)) return;
          e.preventDefault();
          const id = card.getAttribute("data-glpi-id");
          if (!id) return;
          void loadTicket(id);
        });

        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          setError("");
          const glpiId = elId.value;
          if (!glpiId) return;
          const body = {
            name: elName.value,
            content: getQuillHtml(),
            statusId: elStatusId.value === "" ? null : Number(elStatusId.value),
            priorityId: elPriorityId.value === "" ? null : Number(elPriorityId.value)
          };
          const submitBtn = document.getElementById("ticket-edit-submit");
          if (submitBtn) submitBtn.disabled = true;
          try {
            const res = await fetch("/api/tickets/glpi/" + glpiId, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            });
            const data = await res.json().catch(function () { return null; });
            if (!res.ok) {
              setError((data && (data.detail || data.error)) || "Falha ao salvar");
              return;
            }
            closeModal();
            window.location.reload();
          } catch (err) {
            setError("Erro de rede ao salvar");
          } finally {
            if (submitBtn) submitBtn.disabled = false;
          }
        });
      })();
    </script>
  </body>
</html>`;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (method === "GET" && parsedUrl.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ status: "ok", service: "glpi-sync-mvp", sync: syncStatus }));
      return;
    }

    if (method === "GET" && parsedUrl.pathname === "/tickets") {
      const limitParam = Number(parsedUrl.searchParams.get("limit") || 50);
      const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 200) : 50;
      const status = (parsedUrl.searchParams.get("status") || "").trim();
      const group = (parsedUrl.searchParams.get("group") || "").trim();
      const assignedGroup = (parsedUrl.searchParams.get("assignedGroup") || "").trim();
      const openOnly = parsedUrl.searchParams.get("open") === "1";
      try {
        const assignedGroupTicketIds =
          assignedGroup.trim().length > 0
            ? (
                await prisma.ticketAttribute.findMany({
                  where: {
                    OR: [
                      { keyPath: { contains: "team" } },
                      { keyPath: { contains: "group" } },
                      { keyPath: { contains: "assigned" } }
                    ],
                    AND: [
                      {
                        OR: [{ valueText: { contains: assignedGroup } }, { valueJson: { contains: assignedGroup } }]
                      }
                    ]
                  },
                  select: { ticketId: true },
                  distinct: ["ticketId"],
                  take: 5000
                })
              ).map((row) => row.ticketId)
            : [];

        const tickets = await prisma.ticket.findMany({
          where: {
            AND: [
              status ? { status } : {},
              group ? { contractGroupName: { contains: group } } : {},
              assignedGroup
                ? {
                    OR: [
                      { contractGroupName: { contains: assignedGroup } },
                      ...(assignedGroupTicketIds.length > 0 ? [{ id: { in: assignedGroupTicketIds } }] : [])
                    ]
                  }
                : {},
              ...(openOnly ? [ticketWhereNotClosed()] : [])
            ]
          },
          orderBy: { id: "desc" },
          take: limit,
          include: {
            attributes: true
          }
        });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ count: tickets.length, limit, tickets }));
      } catch (error) {
        logger.error({ error: toErrorLog(error) }, "Falha ao consultar tickets");
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Falha ao consultar tickets" }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Servidor HTTP iniciado");
  });
}

async function runSyncWithGuard(): Promise<void> {
  if (isSyncRunning) {
    logger.warn("Sincronizacao anterior ainda em andamento, pulando execucao");
    return;
  }

  isSyncRunning = true;
  syncStatus.isRunning = true;
  syncStatus.runs += 1;
  syncStatus.lastStartedAt = new Date().toISOString();
  syncStatus.lastPage = 0;
  syncStatus.lastLoaded = 0;
  syncStatus.lastSaved = 0;
  syncStatus.lastFailed = 0;
  try {
    await loadOpenApiSpec().catch((error) => {
      logger.warn({ error: toErrorLog(error) }, "Falha ao atualizar doc OpenAPI, usando endpoint padrao");
    });
    const result: SyncTicketsResult = await syncTickets({
      onProgress: applySyncProgress
    });
    applySyncProgress({ page: syncStatus.lastPage || 1, ...result });
    syncStatus.lastSuccessAt = new Date().toISOString();
    syncStatus.lastError = null;
  } catch (error) {
    const details = toErrorLog(error);
    syncStatus.lastError = details.message;
    logger.error({ error: details }, `Falha na sincronizacao de tickets: ${details.message}`);
  } finally {
    isSyncRunning = false;
    syncStatus.isRunning = false;
    syncStatus.lastFinishedAt = new Date().toISOString();
  }
}

async function main(): Promise<void> {
  startHealthServer();
  await ensureSqliteSchema();
  await loadOpenApiSpec().catch((error) => {
    logger.warn({ error: toErrorLog(error) }, "Falha no carregamento inicial do doc OpenAPI");
  });
  await getAccessToken().catch((error) => {
    logger.warn({ error: toErrorLog(error) }, "Falha na autenticacao inicial; cron fara novas tentativas");
  });

  await runSyncWithGuard();

  cron.schedule(env.CRON_EXPRESSION, async () => {
    await runSyncWithGuard();
  });

  logger.info({ cron: env.CRON_EXPRESSION }, "Cron de sincronizacao iniciado");
}

main()
  .catch((error) => {
    logger.error({ error: toErrorLog(error) }, "Erro fatal na inicializacao");
    process.exit(1);
  });
