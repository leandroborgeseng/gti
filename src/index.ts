import http from "node:http";
import cron from "node-cron";
import { Prisma } from "@prisma/client";
import { AxiosError } from "axios";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./config/prisma";
import { normalizeTicket } from "./normalizers/ticket.normalizer";
import { syncTickets, SyncProgress, SyncTicketsResult } from "./jobs/sync-tickets.job";
import { ensureSqliteSchema } from "./scripts/bootstrap-db";
import { loadOpenApiSpec } from "./services/openapi.loader";
import { getAccessToken } from "./services/auth.service";
import { enrichObserverRows, fetchCachedGlpiUserContact } from "./services/glpi-user.service";
import { enrichWaitingPartyBatch, loadAndPersistWaitingParty } from "./services/glpi-ticket-history.service";
import { fetchGlpiTicketJson, patchGlpiTicketJson } from "./services/glpi-ticket-write.service";
import { persistTicketFromRaw } from "./services/ticket-persist.service";
import { extractGlpiScalarId } from "./utils/glpi-field-parse";
import { buildKanbanWhere, pendenciaLabelForSummary } from "./utils/kanban-filters";
import { getOpenTicketAgeBuckets, sumOpenAgeBuckets, type OpenAgeBuckets } from "./utils/open-ticket-aging";
import { extractObserversFromTicketRaw } from "./utils/ticket-observers";
import { extractRequesterContact } from "./utils/ticket-requester";
import { getTicketSyncScope } from "./utils/ticket-sync-scope";

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

/** Colunas sempre em família de azuis (varia levemente por status). */
function columnChromeStyle(statusKey: string): string {
  const h = 212 + (hashStringToUint32(statusKey) % 20);
  const s = 42 + (hashStringToUint32(`cs:${statusKey}`) % 12);
  const l = 89 + (hashStringToUint32(`cl:${statusKey}`) % 5);
  const bg = `hsl(${h} ${s}% ${l}%)`;
  const borderL = Math.max(l - 20, 52);
  const border = `hsl(${h} ${Math.min(s + 14, 56)}% ${borderL}%)`;
  return `--col-bg:${bg};--col-border:${border};--col-heading:#0c1929;--col-muted:rgba(12,25,41,0.62);`;
}

function openDaysApprox(iso: string | null | undefined, ref: Date): number {
  if (!iso) {
    return 0;
  }
  const start = Date.parse(iso);
  if (Number.isNaN(start)) {
    return 0;
  }
  return Math.max(0, (ref.getTime() - start) / 86_400_000);
}

/** Verde forte (recente) → vermelho forte (antigo), ~90 dias. */
function cardHeatChromeStyle(daysOpen: number): string {
  const maxDays = 90;
  const t = Math.min(1, Math.max(0, daysOpen / maxDays));
  const mix = (a: [number, number, number], b: [number, number, number]) =>
    a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const bg = mix([167, 243, 208], [254, 202, 202]);
  const bd = mix([21, 128, 61], [185, 28, 28]);
  return `background:rgb(${bg[0]},${bg[1]},${bg[2]});border:3px solid rgb(${bd[0]},${bd[1]},${bd[2]});box-shadow:0 2px 12px rgba(${bd[0]},${bd[1]},${bd[2]},0.3);`;
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

const KANBAN_SYNC_STALE_MS = 24 * 60 * 60 * 1000;

function kanbanSyncIconSvg(syncStale: boolean): string {
  if (syncStale) {
    return '<svg class="card-sync-flag__svg" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#d97706"/><path d="M10 5.5V11M10 14.5h.01" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>';
  }
  return '<svg class="card-sync-flag__svg" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#16a34a"/><path d="M6 10.2l2.4 2.2L14.2 7" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function kanbanCardSyncTooltipText(
  dateMod: string | null,
  updatedAt: Date,
  syncStale: boolean
): string {
  const base = `GLPI ${formatDateTime(dateMod)} · Sync ${formatDateTime(updatedAt)}`;
  return syncStale ? `${base}. Última gravação no cache há mais de 24 h.` : `${base}. Cache sincronizado nas últimas 24 h.`;
}

function applySyncProgress(progress: SyncProgress): void {
  syncStatus.lastPage = progress.page;
  syncStatus.lastLoaded = progress.loaded;
  syncStatus.lastSaved = progress.saved;
  syncStatus.lastFailed = progress.failed;
}

function agingDashIcon(svgInner: string): string {
  return `<svg class="aging-card__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svgInner}</svg>`;
}

function formatAgingPercentOfTotal(count: number, total: number): string {
  if (total <= 0) {
    return "—";
  }
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format((100 * count) / total);
}

function agingPieSliceTitle(label: string, count: number, total: number): string {
  const pct = formatAgingPercentOfTotal(count, total);
  return escapeHtml(`${label}: ${count} (${pct}%)`);
}

/** Pizza da mesma ordem visual dos cartões (week → noDate). Percentual dentro da fatia; <title> mantém detalhe. */
function buildOpenAgePieSvg(b: OpenAgeBuckets): string {
  const MIN_SWEEP_FOR_LABEL = 0.42;
  const LABEL_RADIUS = 0.56;
  const slices: { n: number; c: string; label: string }[] = [
    { n: b.week, c: "#10b981", label: "Esta semana (ate 7 dias)" },
    { n: b.days15, c: "#14b8a6", label: "8 a 15 dias" },
    { n: b.days30, c: "#f59e0b", label: "16 a 30 dias" },
    { n: b.days60, c: "#f97316", label: "31 a 60 dias" },
    { n: b.over60, c: "#ef4444", label: "Mais de 60 dias" },
    { n: b.noDate, c: "#94a3b8", label: "Sem data de abertura" }
  ];
  const total = slices.reduce((s, x) => s + x.n, 0);
  if (total <= 0) {
    return `<svg class="aging-dash__pie-svg" viewBox="-1 -1 2 2" role="img" aria-label="Sem chamados abertos no filtro"><circle cx="0" cy="0" r="1" fill="#e2e8f0"><title>Sem chamados abertos no filtro</title></circle></svg>`;
  }
  const fullIdx = slices.findIndex((x) => x.n === total);
  if (fullIdx >= 0) {
    const s = slices[fullIdx];
    const tip = agingPieSliceTitle(s.label, s.n, total);
    const pctStr = `${formatAgingPercentOfTotal(s.n, total)}%`;
    const soloLabel = `<text x="0" y="0" class="aging-dash__pie-label" font-size="0.38" text-anchor="middle" dominant-baseline="middle">${escapeHtml(
      pctStr
    )}</text>`;
    return `<svg class="aging-dash__pie-svg" viewBox="-1 -1 2 2" role="img" aria-label="100% numa unica faixa etaria"><circle cx="0" cy="0" r="1" fill="${s.c}"><title>${tip}</title></circle>${soloLabel}</svg>`;
  }
  const r = 0.98;
  let angle = -Math.PI / 2;
  type Seg = { n: number; c: string; label: string; sweep: number; mid: number; tip: string; pctStr: string };
  const segs: Seg[] = [];
  for (const { n, c, label } of slices) {
    if (n <= 0) {
      continue;
    }
    const sweep = (n / total) * 2 * Math.PI;
    segs.push({
      n,
      c,
      label,
      sweep,
      mid: angle + sweep / 2,
      tip: agingPieSliceTitle(label, n, total),
      pctStr: `${formatAgingPercentOfTotal(n, total)}%`
    });
    angle += sweep;
  }
  let paths = "";
  let labels = "";
  angle = -Math.PI / 2;
  for (const seg of segs) {
    const { sweep, c, tip } = seg;
    const next = angle + sweep;
    const x1 = r * Math.cos(angle);
    const y1 = r * Math.sin(angle);
    const x2 = r * Math.cos(next);
    const y2 = r * Math.sin(next);
    const largeArc = sweep > Math.PI ? 1 : 0;
    paths += `<path d="M 0 0 L ${x1.toFixed(4)} ${y1.toFixed(4)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(4)} ${y2.toFixed(4)} Z" fill="${c}"><title>${tip}</title></path>`;
    if (sweep >= MIN_SWEEP_FOR_LABEL) {
      const tx = LABEL_RADIUS * Math.cos(seg.mid);
      const ty = LABEL_RADIUS * Math.sin(seg.mid);
      labels += `<text x="${tx.toFixed(3)}" y="${ty.toFixed(3)}" class="aging-dash__pie-label" font-size="0.22" text-anchor="middle" dominant-baseline="middle">${escapeHtml(
        seg.pctStr
      )}</text>`;
    }
    angle = next;
  }
  return `<svg class="aging-dash__pie-svg" viewBox="-1 -1 2 2" role="img" aria-label="Distribuicao por idade (abertos no filtro)">${paths}${labels}</svg>`;
}

function renderOpenAgeDashboardHtml(b: OpenAgeBuckets): string {
  const total = sumOpenAgeBuckets(b);
  /** Abertos há mais de 7 dias (fora da faixa “esta semana”), indicador de envelhecimento. */
  const delayedCount = b.days15 + b.days30 + b.days60 + b.over60;
  const delayedPctLabel = total > 0 ? formatAgingPercentOfTotal(delayedCount, total) : "—";
  const pieSvg = buildOpenAgePieSvg(b);
  const icons = {
    week: agingDashIcon('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    d15: agingDashIcon('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
    d30: agingDashIcon(
      '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>'
    ),
    d60: agingDashIcon('<path d="M18 20V10M12 20V4M6 20v-6"/><path d="M4 20h16"/>'),
    over: agingDashIcon(
      '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>'
    )
  };

  const card = (tone: string, icon: string, value: number, title: string, hint: string): string => {
    const pct = formatAgingPercentOfTotal(value, total);
    const pctHtml =
      total > 0
        ? `<span class="aging-card__pct" title="Percentual do total de abertos no filtro atual">${escapeHtml(pct)}%</span>`
        : "";
    const aria = total > 0 ? ` aria-label="${escapeHtml(title)}: ${value}, ${pct} por cento do total"` : ` aria-label="${escapeHtml(title)}: ${value}"`;
    return `<div class="aging-card aging-card--${tone}" role="listitem"${aria}>
      <div class="aging-card__iconwrap">${icon}</div>
      <div class="aging-card__value-row">
        <span class="aging-card__value">${value}</span>
        ${pctHtml}
      </div>
      <h3 class="aging-card__title">${title}</h3>
      <p class="aging-card__hint">${hint}</p>
    </div>`;
  };

  const noDateNote =
    b.noDate > 0
      ? ` <span class="aging-dash__nodate" title="Sem data de abertura valida no cache">· ${b.noDate} sem data</span>`
      : "";

  const delayedLine =
    total > 0
      ? `<span class="aging-dash__delayed" title="Chamados com mais de 7 dias desde a data de abertura (exclui a faixa “esta semana”)"><span class="aging-dash__delayed-k">Atraso relativo</span> <span class="aging-dash__delayed-v">${delayedCount}</span> <span class="aging-dash__delayed-p">(${escapeHtml(
          delayedPctLabel
        )}% &gt; 7 dias)</span></span>`
      : "";

  return `<section class="aging-dash" aria-labelledby="aging-dash-title">
    <div class="aging-dash__intro">
      <h2 id="aging-dash-title" class="aging-dash__title">Idade dos chamados abertos</h2>
      <div class="aging-dash__total-row">
        <p class="aging-dash__total">
          <span class="aging-dash__total-num">${total}</span><span class="aging-dash__total-label"> chamados abertos</span>${noDateNote}
          ${delayedLine}
        </p>
        <div class="aging-dash__pie-wrap">${pieSvg}</div>
      </div>
    </div>
    <div class="aging-dash__grid" role="list">
      ${card("week", icons.week, b.week, "Esta semana", "Abertos ha ate 7 dias")}
      ${card("d15", icons.d15, b.days15, "A 15 dias", "Entre 8 e 15 dias abertos")}
      ${card("d30", icons.d30, b.days30, "A 30 dias", "Entre 16 e 30 dias abertos")}
      ${card("d60", icons.d60, b.days60, "A 60 dias", "Entre 31 e 60 dias abertos")}
      ${card("over", icons.over, b.over60, "Mais de 60 dias", "Envelhecidos — priorizar revisao")}
    </div>
  </section>`;
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

    if (method === "POST" && parsedUrl.pathname === "/api/settings/sync-scope") {
      try {
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody) as { scope?: unknown };
        const scope = body.scope === "all" || body.scope === "ALL" ? "all" : "open";
        await prisma.syncState.upsert({
          where: { key: "ticket_sync_scope" },
          update: { value: scope },
          create: { key: "ticket_sync_scope", value: scope }
        });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, scope }));
      } catch (error) {
        logger.error({ error: toErrorLog(error) }, "Falha ao guardar escopo de sincronizacao");
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Falha ao guardar escopo de sincronizacao" }));
      }
      return;
    }

    if (method === "POST" && parsedUrl.pathname === "/api/tickets/recalc-pendencia") {
      try {
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody) as Record<string, unknown>;
        const q = typeof body.q === "string" ? body.q : "";
        const statusFilter = typeof body.status === "string" ? body.status : "";
        const groupFilter = typeof body.group === "string" ? body.group : "";
        const pendenciaParam = typeof body.pendencia === "string" ? body.pendencia : "";
        const onlyOpen = body.open === true || body.open === 1 || body.open === "1";
        const where = buildKanbanWhere({
          q,
          statusFilter,
          groupFilter,
          onlyOpen,
          pendenciaParam
        });
        const rows = await prisma.ticket.findMany({
          where,
          select: { glpiTicketId: true, status: true },
          orderBy: [{ dateCreation: "asc" }, { glpiTicketId: "asc" }],
          take: 200
        });
        let updated = 0;
        for (const row of rows) {
          await loadAndPersistWaitingParty(row.glpiTicketId, row.status);
          updated += 1;
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, updated, scanned: rows.length }));
      } catch (error) {
        logger.error({ error: toErrorLog(error) }, "Falha ao recalcular pendencia");
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Falha ao recalcular pendencia" }));
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
              requesterName: true,
              requesterEmail: true,
              requesterUserId: true,
              rawJson: true
            }
          });
          if (!ticket) {
            res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: "Chamado nao encontrado no cache local" }));
            return;
          }
          const raw = asJsonRecord(ticket.rawJson);
          const history = await loadAndPersistWaitingParty(glpiId, ticket.status);
          const reqFb = extractRequesterContact(ticket.rawJson);
          let requesterName = ticket.requesterName?.trim() ? ticket.requesterName : reqFb.displayName ?? null;
          let requesterEmail = ticket.requesterEmail ?? reqFb.email ?? null;
          let requesterUserId = ticket.requesterUserId ?? reqFb.userId;
          const hasReqEmail = Boolean(requesterEmail && requesterEmail.trim().includes("@"));
          const needsRequesterApi =
            requesterUserId != null &&
            requesterUserId > 0 &&
            (!requesterName?.trim() || !hasReqEmail);
          let workingRaw: Record<string, unknown> =
            ticket.rawJson && typeof ticket.rawJson === "object" && !Array.isArray(ticket.rawJson)
              ? { ...(ticket.rawJson as Record<string, unknown>) }
              : {};
          if (needsRequesterApi) {
            const c = await fetchCachedGlpiUserContact(requesterUserId);
            if (c?.displayName || c?.email) {
              if (!requesterName?.trim() && c.displayName) {
                requesterName = c.displayName;
              }
              if (!hasReqEmail && c.email) {
                requesterEmail = c.email;
              }
              if (c.displayName) {
                workingRaw.users_id_requester_name = c.displayName;
              }
              if (c.email) {
                workingRaw.users_id_requester_email = c.email;
              }
            }
          }
          const observerRows = extractObserversFromTicketRaw(workingRaw, requesterUserId ?? null);
          const observersResolved = await enrichObserverRows(observerRows);
          workingRaw.__gti_observers_resolved = observersResolved.map((r) => ({
            userId: r.userId,
            displayName: r.displayName,
            email: r.email
          }));
          await prisma.ticket.update({
            where: { glpiTicketId: glpiId },
            data: {
              requesterName: requesterName ?? null,
              requesterEmail: requesterEmail ?? null,
              requesterUserId,
              rawJson: workingRaw as Prisma.InputJsonValue
            }
          });
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
            requesterName: requesterName ?? "",
            requesterEmail: requesterEmail ?? "",
            requesterUserId,
            observers: observersResolved,
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
          const norm = normalizeTicket(fresh);
          await loadAndPersistWaitingParty(glpiId, norm.status);
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
      if (parsedUrl.searchParams.has("age")) {
        const redirectParams = new URLSearchParams(parsedUrl.searchParams);
        redirectParams.delete("age");
        const qs = redirectParams.toString();
        res.writeHead(302, { Location: qs ? `/?${qs}` : "/" });
        res.end();
        return;
      }
      const q = (parsedUrl.searchParams.get("q") || "").trim();
      const statusFilter = (parsedUrl.searchParams.get("status") || "").trim();
      const groupFilter = (parsedUrl.searchParams.get("group") || "").trim();
      const onlyOpen = parsedUrl.searchParams.get("open") === "1";
      const pendenciaParam = (parsedUrl.searchParams.get("pendencia") || "").trim();
      const openFilterEffective = onlyOpen;
      let latestTickets: Array<{
        glpiTicketId: number;
        title: string | null;
        status: string | null;
        contractGroupName: string | null;
        dateCreation: string | null;
        dateModification: string | null;
        waitingParty: string | null;
        updatedAt: Date;
        requesterName: string | null;
        requesterEmail: string | null;
        requesterUserId: number | null;
        rawJson: unknown;
      }> = [];
      let statuses: string[] = [];
      let groups: string[] = [];
      let filteredTotal = 0;
      let kanbanSettings: KanbanSettings = {};
      let ticketSyncScope: Awaited<ReturnType<typeof getTicketSyncScope>> = "open";
      let ageBuckets: OpenAgeBuckets = {
        week: 0,
        days15: 0,
        days30: 0,
        days60: 0,
        over60: 0,
        noDate: 0
      };
      try {
        const where = buildKanbanWhere({
          q,
          statusFilter,
          groupFilter,
          onlyOpen,
          pendenciaParam
        });
        const whereAge = buildKanbanWhere({
          q,
          statusFilter,
          groupFilter,
          onlyOpen,
          pendenciaParam,
          forceNonClosed: true
        });

        const [totalFiltered, kanbanStored, scope] = await Promise.all([
          prisma.ticket.count({ where }),
          readKanbanSettings(),
          getTicketSyncScope()
        ]);
        ticketSyncScope = scope;
        filteredTotal = totalFiltered;
        kanbanSettings = kanbanStored;

        const [ageBucketsResult, latestTicketRows, statusRows, groupRows] = await Promise.all([
          getOpenTicketAgeBuckets(whereAge),
          prisma.ticket.findMany({
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
              waitingParty: true,
              updatedAt: true,
              requesterName: true,
              requesterEmail: true,
              requesterUserId: true,
              rawJson: true
            }
          }),
          prisma.ticket.findMany({
            where: { status: { not: null } },
            distinct: ["status"],
            select: { status: true },
            orderBy: { status: "asc" }
          }),
          prisma.ticket.findMany({
            where: { contractGroupName: { not: null } },
            distinct: ["contractGroupName"],
            select: { contractGroupName: true },
            orderBy: { contractGroupName: "asc" }
          })
        ]);
        ageBuckets = ageBucketsResult;
        latestTickets = latestTicketRows;
        statuses = statusRows.map((item) => item.status).filter((item): item is string => Boolean(item));
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
          requesterName: string | null;
          requesterEmail: string | null;
          requesterUserId: number | null;
          dateCreation: string | null;
          dateModification: string | null;
          waitingParty: string | null;
          updatedAt: Date;
          rawJson: unknown;
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
          return `--col-bg:${override};--col-border:hsl(218 42% 58%);--col-heading:#0c1929;--col-muted:rgba(12,25,41,0.62);`;
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
              const reqFromRaw = extractRequesterContact(ticket.rawJson);
              const reqName = ticket.requesterName ?? reqFromRaw.displayName;
              const reqEmail = ticket.requesterEmail ?? reqFromRaw.email;
              const safeRequester = escapeHtml(reqName || "—");
              const safeEmail = reqEmail ? escapeHtml(reqEmail) : "";
              const daysOpen = openDaysApprox(ticket.dateCreation, now);
              const cardStyle = cardHeatChromeStyle(daysOpen);
              const openFor = formatTicketAge(ticket.dateCreation, now);
              const idleFor = formatTicketAge(ticket.dateModification || ticket.dateCreation, now);
              const pendLabel =
                ticket.waitingParty === "cliente"
                  ? "Aguardando cliente"
                  : ticket.waitingParty === "empresa"
                    ? "Aguardando empresa"
                    : ticket.waitingParty === "na"
                      ? "Sem pendencia"
                      : ticket.waitingParty === "unknown"
                        ? "Pendencia ?"
                        : "Pendencia nao calculada";
              const pendClass =
                ticket.waitingParty === "cliente" ||
                ticket.waitingParty === "empresa" ||
                ticket.waitingParty === "na" ||
                ticket.waitingParty === "unknown"
                  ? ticket.waitingParty
                  : "none";
              const updAt = ticket.updatedAt instanceof Date ? ticket.updatedAt : new Date(ticket.updatedAt);
              const syncAgeMs = now.getTime() - updAt.getTime();
              const syncStale = !Number.isFinite(syncAgeMs) || syncAgeMs > KANBAN_SYNC_STALE_MS;
              const syncTip = escapeHtml(kanbanCardSyncTooltipText(ticket.dateModification, updAt, syncStale));
              const syncFlag = `<span class="card-sync-flag${syncStale ? " card-sync-flag--stale" : ""}" title="${syncTip}" aria-label="${syncTip}" role="img">${kanbanSyncIconSvg(
                syncStale
              )}</span>`;
              return `<div class="kanban-card" draggable="false" role="button" tabindex="0" data-glpi-id="${
                ticket.glpiTicketId
              }" data-waiting="${escapeHtml(pendClass)}" style="${escapeHtml(cardStyle)}">
                <div class="kanban-card__head">
                  <div class="card-id">#${ticket.glpiTicketId}</div>
                  ${syncFlag}
                </div>
                <div class="card-title">${safeTitle}</div>
                <span class="pend-badge pend-badge--${escapeHtml(pendClass)}">${escapeHtml(pendLabel)}</span>
                <div class="card-meta">Grupo: ${safeGroup}</div>
                <div class="card-meta">Solicitante: <strong>${safeRequester}</strong>${
                  safeEmail ? ` · <span class="card-meta--fine">${safeEmail}</span>` : ""
                }</div>
                <div class="card-meta">Aberto há <strong>${escapeHtml(openFor)}</strong> · Sem interação <strong>${escapeHtml(
                  idleFor
                )}</strong></div>
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

      const pill = (label: string, value: string, muted = false): string =>
        `<span class="filter-pill${muted ? " filter-pill--muted" : ""}"><span class="filter-pill__k">${escapeHtml(
          label
        )}</span><span class="filter-pill__v">${value}</span></span>`;
      const openLabel = openFilterEffective ? "Sim" : "Nao";
      const filterPillsHtml = [
        pill("Busca", q ? escapeHtml(q) : "—", !q),
        pill("Status", statusFilter ? escapeHtml(statusFilter) : "Todos", !statusFilter),
        pill("Grupo", groupFilter ? escapeHtml(groupFilter) : "Todos", !groupFilter),
        pill("Abertos", escapeHtml(openLabel), !openFilterEffective),
        pill("Pendência", escapeHtml(pendenciaLabelForSummary(pendenciaParam)), pendenciaParam === ""),
        pill(
          "Sync cache",
          escapeHtml(ticketSyncScope === "all" ? "Todos os tickets" : "Só abertos"),
          ticketSyncScope === "open"
        )
      ].join("");

      const openAgeDashboardHtml = renderOpenAgeDashboardHtml(ageBuckets);

      const filterJsonForScript = JSON.stringify({
        q,
        status: statusFilter,
        group: groupFilter,
        open: onlyOpen,
        pendencia: pendenciaParam
      }).replace(/</g, "\\u003c");

      const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chamados — GTI</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet" />
    <style>
      :root {
        --ink: #0f172a;
        --ink-muted: #475569;
        --surface: #ffffff;
        --canvas: #f1f5f9;
        --canvas-deep: #e2e8f0;
        --brand: #1d4ed8;
        --brand-soft: #dbeafe;
        --radius-lg: 16px;
        --radius-md: 12px;
        --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
        --shadow-md: 0 8px 24px rgba(15, 23, 42, 0.08);
        --shadow-modal: 0 24px 64px rgba(15, 23, 42, 0.18);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
        color: var(--ink);
        background: linear-gradient(165deg, var(--canvas) 0%, #e8eef5 48%, #f8fafc 100%);
        -webkit-font-smoothing: antialiased;
      }
      code { font-size: 0.88em; background: #f1f5f9; padding: 0.12rem 0.4rem; border-radius: 6px; color: #334155; }
      .app-shell { max-width: 1320px; margin: 0 auto; padding: 1.75rem 1.25rem 3rem; }
      @media (min-width: 768px) { .app-shell { padding: 2rem 2rem 3.5rem; } }
      .page-header { margin-bottom: 1rem; }
      .page-kicker { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--brand); margin: 0 0 0.35rem 0; }
      .page-title { font-size: clamp(1.65rem, 3vw, 2.1rem); font-weight: 700; letter-spacing: -0.02em; margin: 0 0 0.5rem 0; color: var(--ink); }
      .page-lead { margin: 0; max-width: 62ch; font-size: 0.95rem; line-height: 1.55; color: var(--ink-muted); }
      .muted { color: var(--ink-muted); font-size: 0.9rem; }
      .kanban-filters-stack {
        margin: 0 0 1.35rem 0;
      }
      .kanban-filters-stack .filters-shell {
        margin-bottom: 0;
      }
      .filters-shell {
        background: var(--surface);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: var(--radius-lg);
        padding: 1.1rem 1.2rem 1.15rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      }
      .filters-shell__head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.35rem 1rem;
        margin-bottom: 0.75rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid #f1f5f9;
      }
      .filters-shell__title {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--ink);
      }
      .filters-shell__lede {
        margin: 0;
        font-size: 0.78rem;
        color: var(--ink-muted);
        font-weight: 500;
      }
      .filters-shell__pills {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        margin-bottom: 1rem;
        min-height: 1.5rem;
      }
      .filter-pill {
        display: inline-flex;
        align-items: baseline;
        gap: 0.35rem;
        padding: 0.28rem 0.65rem 0.32rem;
        border-radius: 999px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        font-size: 0.78rem;
        line-height: 1.25;
      }
      .filter-pill--muted {
        opacity: 0.72;
        background: #fafafa;
      }
      .filter-pill__k {
        font-weight: 600;
        color: #64748b;
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .filter-pill__v {
        font-weight: 600;
        color: #0f172a;
        max-width: 18rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .filters-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 0.75rem 1rem;
        align-items: end;
        margin: 0;
      }
      .filters-grid--wide {
        grid-column: 1 / -1;
      }
      .filters-grid label {
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #64748b;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        min-width: 0;
      }
      .filters-grid input,
      .filters-grid select {
        font: inherit;
        font-size: 0.9rem;
        font-weight: 500;
        letter-spacing: normal;
        text-transform: none;
        color: var(--ink);
        padding: 0.5rem 0.65rem;
        width: 100%;
        min-width: 0;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fff;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .filters-grid input:focus,
      .filters-grid select:focus {
        outline: none;
        border-color: var(--brand);
        box-shadow: 0 0 0 2px rgba(29, 78, 216, 0.12);
      }
      .filters-shell__sync {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid #f1f5f9;
      }
      .filters-shell__sync-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 0.75rem;
      }
      .filters-shell__sync-h {
        font-size: 0.68rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #64748b;
        margin-right: 0.25rem;
      }
      .filters-shell__sync-select {
        font: inherit;
        font-size: 0.82rem;
        padding: 0.4rem 0.55rem;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        background: #fff;
        min-width: 11rem;
        max-width: 100%;
      }
      .filters-shell__sync-msg {
        margin: 0.5rem 0 0 0;
        font-size: 0.78rem;
        font-weight: 500;
        min-height: 1.35em;
      }
      .section-head { margin: 0 0 0.75rem 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.75rem 1rem; justify-content: space-between; }
      .section-head--kanban { align-items: flex-start; gap: 0.75rem 1.25rem; }
      .section-head--kanban > div:first-child { flex: 1 1 12rem; min-width: 0; }
      .section-title { margin: 0; font-size: 1.15rem; font-weight: 700; color: var(--ink); }
      .section-tools { font-size: 0.85rem; color: var(--ink-muted); max-width: 36rem; line-height: 1.45; }
      .btn-fs {
        font: inherit;
        font-weight: 600;
        font-size: 0.88rem;
        padding: 0.5rem 1rem;
        border-radius: 10px;
        border: 1px solid rgba(29, 78, 216, 0.35);
        background: linear-gradient(180deg, #fff 0%, #eff6ff 100%);
        color: #1e40af;
        cursor: pointer;
        flex-shrink: 0;
        box-shadow: 0 1px 4px rgba(29, 78, 216, 0.12);
        transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
      }
      .btn-fs:hover { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(29, 78, 216, 0.2); border-color: rgba(29, 78, 216, 0.55); }
      .btn-fs[aria-pressed="true"] {
        background: linear-gradient(180deg, #1e40af 0%, #1d4ed8 100%);
        color: #fff;
        border-color: #1e3a8a;
      }
      .aging-dash {
        margin: 0 0 1.5rem 0;
        padding: 1.35rem 1.35rem 1.45rem;
        border-radius: var(--radius-lg);
        background:
          linear-gradient(145deg, rgba(255, 255, 255, 0.97) 0%, rgba(248, 250, 252, 0.92) 42%, rgba(239, 246, 255, 0.75) 100%);
        border: 1px solid rgba(148, 163, 184, 0.4);
        box-shadow: var(--shadow-md), 0 1px 0 rgba(255, 255, 255, 0.8) inset;
      }
      .aging-dash__intro { margin-bottom: 0.85rem; }
      .aging-dash__title {
        margin: 0 0 0.5rem 0;
        font-size: 1.12rem;
        font-weight: 800;
        letter-spacing: -0.025em;
        color: var(--ink);
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .aging-dash__title::before {
        content: "";
        width: 4px;
        height: 1.35rem;
        border-radius: 99px;
        background: linear-gradient(180deg, #2563eb, #7c3aed);
        flex-shrink: 0;
      }
      .aging-dash__total-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.85rem 1.25rem;
      }
      .aging-dash__total {
        margin: 0;
        flex: 1 1 14rem;
        font-size: 0.84rem;
        color: var(--ink-muted);
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.25rem 0.6rem;
      }
      .aging-dash__delayed {
        flex-basis: 100%;
        margin-top: 0.35rem;
        font-size: 0.8rem;
        line-height: 1.45;
        color: #334155;
      }
      .aging-dash__delayed-k { font-weight: 600; color: #64748b; margin-right: 0.25rem; }
      .aging-dash__delayed-v { font-weight: 800; font-variant-numeric: tabular-nums; color: #b45309; }
      .aging-dash__delayed-p { font-weight: 700; font-variant-numeric: tabular-nums; color: #b91c1c; }
      .aging-dash__pie-wrap {
        flex-shrink: 0;
        width: 7.75rem;
        height: 7.75rem;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.65);
        border: 1px solid rgba(148, 163, 184, 0.35);
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
        padding: 0.28rem;
        box-sizing: border-box;
      }
      .aging-dash__pie-svg {
        width: 100%;
        height: 100%;
        display: block;
        border-radius: 50%;
      }
      .aging-dash__pie-svg path,
      .aging-dash__pie-svg circle {
        cursor: help;
      }
      .aging-dash__pie-label {
        pointer-events: none;
        font-family: "Plus Jakarta Sans", system-ui, sans-serif;
        font-weight: 800;
        fill: #fff;
        stroke: rgba(15, 23, 42, 0.42);
        stroke-width: 0.055;
        paint-order: stroke fill;
      }
      .aging-dash__total-num {
        font-size: 1.45rem;
        font-weight: 800;
        color: var(--brand);
        letter-spacing: -0.04em;
        font-variant-numeric: tabular-nums;
      }
      .aging-dash__total-label { font-weight: 600; color: #334155; }
      .aging-dash__nodate { color: #c2410c; font-weight: 600; font-size: 0.8rem; }
      .aging-dash__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
        gap: 0.9rem;
      }
      @media (min-width: 1024px) {
        .aging-dash__grid { grid-template-columns: repeat(5, 1fr); }
      }
      .aging-card {
        position: relative;
        border-radius: 14px;
        padding: 0.95rem 0.85rem 1rem 3.15rem;
        min-height: 112px;
        overflow: hidden;
        border: 1px solid rgba(15, 23, 42, 0.06);
        box-shadow: var(--shadow-sm);
        transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        color: inherit;
        display: block;
        cursor: default;
      }
      .aging-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.1);
        border-color: rgba(29, 78, 216, 0.2);
      }
      .aging-card__iconwrap {
        position: absolute;
        left: 0.75rem;
        top: 0.85rem;
        width: 2.1rem;
        height: 2.1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 11px;
      }
      .aging-card__svg { width: 1.28rem; height: 1.28rem; }
      .aging-card__value-row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.35rem 0.45rem;
        margin-bottom: 0.42rem;
      }
      .aging-card__value {
        font-size: 1.85rem;
        font-weight: 800;
        letter-spacing: -0.04em;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .aging-card__pct {
        font-size: 0.95rem;
        font-weight: 800;
        color: rgba(15, 23, 42, 0.5);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.02em;
      }
      .aging-card__title {
        margin: 0 0 0.22rem 0;
        font-size: 0.8rem;
        font-weight: 700;
        color: rgba(15, 23, 42, 0.92);
        line-height: 1.28;
      }
      .aging-card__hint { margin: 0; font-size: 0.7rem; line-height: 1.38; color: rgba(51, 65, 85, 0.9); }
      .aging-card--week {
        background: linear-gradient(155deg, #ecfdf5 0%, #d1fae5 55%, #a7f3d0 100%);
      }
      .aging-card--week .aging-card__iconwrap {
        background: rgba(16, 185, 129, 0.22);
        color: #047857;
      }
      .aging-card--week .aging-card__value { color: #065f46; }
      .aging-card--d15 {
        background: linear-gradient(155deg, #f0fdfa 0%, #ccfbf1 50%, #99f6e4 100%);
      }
      .aging-card--d15 .aging-card__iconwrap {
        background: rgba(20, 184, 166, 0.22);
        color: #0f766e;
      }
      .aging-card--d15 .aging-card__value { color: #115e59; }
      .aging-card--d30 {
        background: linear-gradient(155deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%);
      }
      .aging-card--d30 .aging-card__iconwrap {
        background: rgba(245, 158, 11, 0.22);
        color: #b45309;
      }
      .aging-card--d30 .aging-card__value { color: #92400e; }
      .aging-card--d60 {
        background: linear-gradient(155deg, #fff7ed 0%, #ffedd5 50%, #fdba74 100%);
      }
      .aging-card--d60 .aging-card__iconwrap {
        background: rgba(249, 115, 22, 0.22);
        color: #c2410c;
      }
      .aging-card--d60 .aging-card__value { color: #9a3412; }
      .aging-card--over {
        background: linear-gradient(155deg, #fef2f2 0%, #fecaca 48%, #fca5a5 100%);
      }
      .aging-card--over .aging-card__iconwrap {
        background: rgba(220, 38, 38, 0.2);
        color: #b91c1c;
      }
      .aging-card--over .aging-card__value { color: #991b1b; }
      .kanban-fs-root { margin-bottom: 0; }
      /* Modal como filho direto: não participa do flex do quadro em tela cheia */
      .kanban-fs-root > .modal {
        flex: none;
      }
      .kanban-fs-root:fullscreen,
      .kanban-fs-root:-webkit-full-screen {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 1rem 1.25rem 1.5rem;
        box-sizing: border-box;
        background: linear-gradient(165deg, var(--canvas) 0%, #e8eef5 48%, #f8fafc 100%);
        overflow: auto;
        display: flex;
        flex-direction: column;
      }
      .kanban-fs-root:fullscreen .kanban-legend,
      .kanban-fs-root:-webkit-full-screen .kanban-legend {
        flex-shrink: 0;
        margin-bottom: 0.85rem;
      }
      .kanban-fs-root:fullscreen .kanban-board,
      .kanban-fs-root:-webkit-full-screen .kanban-board {
        flex: 1;
        min-height: 12rem;
        overflow-x: auto;
        overflow-y: auto;
        flex-wrap: nowrap;
        align-items: stretch;
        align-content: flex-start;
        padding-bottom: 0.35rem;
        -webkit-overflow-scrolling: touch;
      }
      .kanban-fs-root:fullscreen .kanban-column,
      .kanban-fs-root:-webkit-full-screen .kanban-column {
        flex: 0 0 300px;
        width: 300px;
        min-width: 260px;
        max-width: none;
        max-height: none;
      }
      .kanban-fs-root:fullscreen .kanban-column-body,
      .kanban-fs-root:-webkit-full-screen .kanban-column-body {
        max-height: min(72vh, 900px);
        overflow-y: auto;
      }
      .small { font-size: 0.8125rem; color: var(--ink-muted); line-height: 1.4; }
      .kanban-legend {
        margin: 0 0 1.25rem 0;
        padding: 0.65rem 1rem;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 1rem;
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: var(--radius-md);
        font-size: 0.82rem;
        color: var(--ink-muted);
      }
      .legend-swatch { width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0; border: 3px solid; }
      .legend-swatch--fresh { background: rgb(167, 243, 208); border-color: rgb(21, 128, 61); }
      .legend-swatch--stale { background: rgb(254, 202, 202); border-color: rgb(185, 28, 28); }
      .legend-arrow { opacity: 0.45; margin: 0 0.2rem; font-weight: 600; }
      .kanban-board {
        display: flex;
        flex-wrap: nowrap;
        gap: 1rem;
        align-items: stretch;
        width: 100%;
        overflow-x: auto;
        overflow-y: visible;
        padding-bottom: 0.35rem;
        -webkit-overflow-scrolling: touch;
        scrollbar-gutter: stable;
      }
      .kanban-column {
        flex: 0 0 300px;
        width: 300px;
        min-width: 260px;
        max-width: none;
        border: 1px solid var(--col-border, #94a3b8);
        border-radius: var(--radius-md);
        padding: 0;
        background: var(--col-bg, #e0f2fe);
        min-height: 140px;
        overflow: hidden;
        box-shadow: var(--shadow-sm);
      }
      .kanban-column.dragging { opacity: 0.72; transform: scale(0.99); }
      .kanban-column-handle {
        padding: 0.85rem 1rem;
        cursor: grab;
        background: linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.2) 100%);
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        color: var(--col-heading, #0f172a);
      }
      .kanban-column-handle:active { cursor: grabbing; }
      .kanban-column h3 { margin: 0; font-size: 0.92rem; font-weight: 700; letter-spacing: -0.01em; color: var(--col-heading, #0f172a); }
      .kanban-column h3 .small { color: var(--col-muted, rgba(15,23,42,0.55)); font-weight: 600; }
      .kanban-column-body { padding: 0.75rem; background: rgba(255,255,255,0.35); }
      .kanban-card {
        border-radius: 12px;
        padding: 0.75rem 0.85rem;
        margin-bottom: 0.65rem;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        cursor: pointer;
        text-align: left;
        transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
      }
      .kanban-card:hover { transform: translateY(-2px); filter: brightness(1.02); }
      .kanban-card:focus-visible { outline: 3px solid var(--brand); outline-offset: 2px; }
      .kanban-card__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.4rem;
      }
      .card-sync-flag {
        flex-shrink: 0;
        cursor: help;
        line-height: 0;
        margin-top: 0.06rem;
        opacity: 0.92;
      }
      .card-sync-flag:hover { opacity: 1; }
      .card-sync-flag__svg { width: 1.05rem; height: 1.05rem; display: block; }
      .card-sync-flag--stale .card-sync-flag__svg { filter: drop-shadow(0 0 1px rgba(120, 53, 15, 0.35)); }
      .card-id { font-size: 0.72rem; font-weight: 700; color: var(--ink-muted); letter-spacing: 0.02em; min-width: 0; }
      .card-title { font-size: 0.9rem; font-weight: 600; color: var(--ink); line-height: 1.35; }
      .card-meta { font-size: 0.78rem; color: #334155; line-height: 1.4; }
      .card-meta--fine { font-size: 0.72rem; color: #64748b; }
      .pend-badge { display: inline-block; width: fit-content; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.2rem 0.5rem; border-radius: 6px; margin: 0.1rem 0 0.15rem 0; }
      .pend-badge--cliente { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
      .pend-badge--empresa { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
      .pend-badge--na { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
      .pend-badge--unknown { background: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe; }
      .pend-badge--none { background: #f8fafc; color: #64748b; border: 1px dashed #cbd5e1; }
      .modal { display: none; position: fixed; inset: 0; z-index: 100; align-items: center; justify-content: center; padding: 1rem; }
      .modal.open { display: flex; }
      .modal-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(6px); }
      .modal-panel {
        position: relative;
        z-index: 1;
        width: min(780px, 100%);
        max-height: 92vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background: var(--surface);
        border-radius: 20px;
        box-shadow: var(--shadow-modal);
        border: 1px solid rgba(148, 163, 184, 0.25);
      }
      .modal-header {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1.1rem 1.35rem;
        background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%);
        color: #fff;
      }
      .modal-header h2 { margin: 0; font-size: 1.15rem; font-weight: 700; letter-spacing: -0.02em; }
      .modal-close {
        width: 2.25rem;
        height: 2.25rem;
        border: none;
        border-radius: 10px;
        background: rgba(255,255,255,0.15);
        color: #fff;
        font-size: 1.35rem;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
      }
      .modal-close:hover { background: rgba(255,255,255,0.28); }
      #ticket-edit-form {
        padding: 1.35rem 1.35rem 1.5rem;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .modal-field { display: flex; flex-direction: column; gap: 0.45rem; font-size: 0.84rem; font-weight: 600; letter-spacing: -0.01em; color: var(--ink-muted); }
      .modal-field input {
        font: inherit;
        font-size: 1rem;
        font-weight: 500;
        text-transform: none;
        letter-spacing: normal;
        padding: 0.65rem 0.85rem;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        background: #f8fafc;
        color: var(--ink);
      }
      .modal-field input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.12); background: #fff; }
      .modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
      @media (max-width: 560px) { .modal-grid { grid-template-columns: 1fr; } }
      .modal-hint { margin: 0; font-size: 0.85rem; color: var(--ink-muted); }
      .modal-hint--multiline { white-space: pre-line; line-height: 1.55; }
      .modal-error { margin: 0; font-size: 0.88rem; font-weight: 500; color: #b91c1c; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 0.65rem; margin-top: 0.25rem; padding-top: 0.5rem; border-top: 1px solid #e2e8f0; }
      .btn-secondary {
        font: inherit;
        font-weight: 600;
        font-size: 0.88rem;
        padding: 0.52rem 1.05rem;
        border: 1px solid #cbd5e1;
        background: #fff;
        color: var(--ink-muted);
        border-radius: 10px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
        flex-shrink: 0;
      }
      .btn-secondary:hover { background: #f8fafc; border-color: #94a3b8; color: var(--ink); }
      #ticket-edit-submit {
        font: inherit;
        font-weight: 600;
        padding: 0.6rem 1.35rem;
        border: none;
        border-radius: 10px;
        background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
        color: #fff;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(29, 78, 216, 0.35);
      }
      #ticket-edit-submit:hover { filter: brightness(1.05); }
      #ticket-edit-submit:disabled { opacity: 0.55; cursor: not-allowed; filter: none; }
      .modal-field-rich .ticket-quill-editor { border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; background: #fff; }
      .modal-field-rich .ql-toolbar { border: none; border-bottom: 1px solid #e2e8f0; font-family: "Plus Jakarta Sans", sans-serif; background: #f8fafc; }
      .modal-field-rich .ql-container { border: none; font-size: 0.95rem; font-family: "Plus Jakarta Sans", sans-serif; }
      .modal-field-rich .ql-editor { min-height: 200px; max-height: 40vh; overflow-y: auto; }
      .modal-field-rich .ql-editor.ql-blank::before { font-style: normal; color: #94a3b8; }
      #ticket-history-section {
        margin-top: 0.25rem;
        padding: 1rem;
        background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
        border: 1px solid #e2e8f0;
        border-radius: var(--radius-md);
      }
      .history-heading { margin: 0 0 0.5rem 0; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
      .history-help { margin: 0 0 0.75rem 0; font-size: 0.82rem; line-height: 1.5; color: var(--ink-muted); }
      .waiting-banner { padding: 0.85rem 1rem; border-radius: 10px; margin-bottom: 0.85rem; font-size: 0.9rem; line-height: 1.45; }
      .waiting-banner strong { display: block; margin-bottom: 0.3rem; font-size: 0.95rem; }
      .waiting-banner.waiting-empresa { background: #eff6ff; border: 1px solid #93c5fd; color: #1e3a8a; }
      .waiting-banner.waiting-cliente { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; }
      .waiting-banner.waiting-unknown { background: #f8fafc; border: 1px solid #cbd5e1; color: #475569; }
      .waiting-banner.waiting-na { background: #f1f5f9; border: 1px solid #94a3b8; color: #475569; }
      .history-list { max-height: 34vh; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.35rem; background: #fff; }
      .history-item { border-bottom: 1px solid #f1f5f9; padding: 0.65rem 0.5rem; }
      .history-item:last-child { border-bottom: none; }
      .history-meta { font-size: 0.72rem; font-weight: 600; color: #64748b; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.03em; }
      .history-body { font-size: 0.88rem; line-height: 1.5; color: var(--ink); }
      .history-body img { max-width: 100%; height: auto; border-radius: 6px; }
      #ticket-history-api-error { color: #b45309; margin: 0 0 0.5rem 0; font-size: 0.85rem; font-weight: 500; }
    </style>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css" crossorigin="anonymous" />
  </head>
  <body>
    <div class="app-shell">
    <header class="page-header">
      <p class="page-kicker">Operação · GLPI</p>
      <h1 class="page-title">Quadro de chamados</h1>
    </header>

    ${openAgeDashboardHtml}
    <div class="kanban-filters-stack">
    <div class="filters-shell">
      <header class="filters-shell__head">
        <h2 class="filters-shell__title">Filtros do Kanban</h2>
        <p class="filters-shell__lede">Aplicam ao quadro, ao painel de idade dos abertos e ao recálculo de pendência (até 200 cards por coluna)</p>
      </header>
      <div class="filters-shell__pills" aria-label="Filtros aplicados">${filterPillsHtml}</div>
      <form id="kanban-filters-form" class="filters-grid" method="GET" action="/">
        <label>Busca
          <input type="text" name="q" value="${escapeHtml(q)}" placeholder="ID, título ou conteúdo" autocomplete="off" />
        </label>
        <label>Status
          <select name="status">
            <option value="">Todos</option>
            ${statusOptions}
          </select>
        </label>
        <label>Grupo
          <select name="group">
            <option value="">Todos</option>
            ${groupOptions}
          </select>
        </label>
        <label>Pendência
          <select name="pendencia" title="Inferência no cache">
            <option value="" ${pendenciaParam === "" ? "selected" : ""}>Todas</option>
            <option value="cliente" ${pendenciaParam.toLowerCase() === "cliente" ? "selected" : ""}>Cliente</option>
            <option value="empresa" ${pendenciaParam.toLowerCase() === "empresa" ? "selected" : ""}>Empresa</option>
            <option value="desconhecido" ${pendenciaParam.toLowerCase() === "desconhecido" ? "selected" : ""}>Indefinido</option>
            <option value="na" ${pendenciaParam.toLowerCase() === "na" ? "selected" : ""}>Encerrado</option>
          </select>
        </label>
        <label>Só abertos
          <select name="open">
            <option value="0" ${onlyOpen ? "" : "selected"}>Não</option>
            <option value="1" ${onlyOpen ? "selected" : ""}>Sim</option>
          </select>
        </label>
      </form>
      <footer class="filters-shell__sync">
        <div class="filters-shell__sync-row">
          <span class="filters-shell__sync-h">Cache</span>
          <select id="sync-scope-select" class="filters-shell__sync-select" aria-label="Escopo de sincronizacao no cache" title="Próximo ciclo do cron">
            <option value="open" ${ticketSyncScope === "open" ? "selected" : ""}>Só abertos no SQLite</option>
            <option value="all" ${ticketSyncScope === "all" ? "selected" : ""}>Todos (abertos + fechados)</option>
          </select>
          <button type="submit" form="kanban-filters-form" class="btn-secondary" id="btn-filters-apply">Aplicar</button>
          <button type="button" class="btn-secondary" id="btn-save-sync-scope">Guardar escopo</button>
          <button type="button" class="btn-secondary" id="btn-recalc-pendencia" title="Até 200 tickets com os filtros atuais">Recalcular pendência</button>
        </div>
        <p class="filters-shell__sync-msg" id="sync-toolbar-msg" role="status" aria-live="polite" hidden></p>
      </footer>
    </div>
    <script type="application/json" id="kanban-filter-json">${filterJsonForScript}</script>
    <script>
      (function () {
        var msg = document.getElementById("sync-toolbar-msg");
        function show(text, kind) {
          if (!msg) return;
          msg.hidden = false;
          msg.textContent = text;
          var color = "#b45309";
          if (kind === true || kind === "ok") color = "#15803d";
          else if (kind === "progress") color = "#1d4ed8";
          msg.style.color = color;
        }
        var filterEl = document.getElementById("kanban-filter-json");
        var filterState = {};
        try {
          filterState = filterEl ? JSON.parse(filterEl.textContent || "{}") : {};
        } catch (e) {
          filterState = {};
        }
        var sel = document.getElementById("sync-scope-select");
        document.getElementById("btn-save-sync-scope")?.addEventListener("click", function () {
          var scope = sel && sel.value === "all" ? "all" : "open";
          fetch("/api/settings/sync-scope", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope: scope })
          })
            .then(function (res) {
              return res.json().then(function (data) {
                return { res: res, data: data };
              });
            })
            .then(function (x) {
              if (!x.res.ok) {
                throw new Error((x.data && x.data.error) || "Falha ao guardar");
              }
              show("Escopo guardado (" + x.data.scope + "). Vale na próxima sincronização.", true);
            })
            .catch(function (err) {
              show(String(err && err.message ? err.message : err), false);
            });
        });
        document.getElementById("btn-recalc-pendencia")?.addEventListener("click", function () {
          var btn = document.getElementById("btn-recalc-pendencia");
          if (!btn || btn.disabled) return;
          var origLabel = btn.textContent;
          btn.disabled = true;
          btn.setAttribute("aria-busy", "true");
          btn.textContent = "A recalcular…";
          show(
            "A recalcular pendência nos chamados do filtro (até 200). Aguarde — pode demorar se o GLPI estiver lento.",
            "progress"
          );
          fetch("/api/tickets/recalc-pendencia", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(filterState)
          })
            .then(function (res) {
              return res.json().then(function (data) {
                return { res: res, data: data };
              });
            })
            .then(function (x) {
              if (!x.res.ok) {
                throw new Error((x.data && x.data.error) || "Falha no recálculo");
              }
              var scanned = x.data.scanned != null ? x.data.scanned : 0;
              var updated = x.data.updated != null ? x.data.updated : 0;
              show(
                "Concluído: " +
                  scanned +
                  " chamado(s) processados; pendência gravada em " +
                  updated +
                  ". A atualizar o quadro…",
                true
              );
              setTimeout(function () {
                window.location.reload();
              }, 1100);
            })
            .catch(function (err) {
              show(String(err && err.message ? err.message : err), false);
              btn.disabled = false;
              btn.removeAttribute("aria-busy");
              btn.textContent = origLabel;
            });
        });
      })();
    </script>
    </div>
    <div class="kanban-fs-root" id="kanban-fullscreen-root">
    <div class="section-head section-head--kanban">
      <div>
        <h2 class="section-title">Kanban por status</h2>
        <p class="section-tools">Arraste pelo <strong>cabeçalho azul</strong> da coluna para reordenar. Clique no card para abrir o painel de edição e histórico.</p>
      </div>
      <button type="button" class="btn-fs" id="kanban-fs-toggle" aria-pressed="false" title="Maximizar o quadro para reuniao ou TV">Tela inteira</button>
    </div>
    <p class="kanban-legend" role="note">
      <span class="legend-swatch legend-swatch--fresh" aria-hidden="true"></span>
      <span>Recente (verde)</span>
      <span class="legend-arrow" aria-hidden="true">→</span>
      <span class="legend-swatch legend-swatch--stale" aria-hidden="true"></span>
      <span>Aberto há mais tempo (vermelho, até ~90 dias)</span>
    </p>
    <div class="kanban-board" id="kanban-board">
      ${kanbanColumnsHtml || '<div class="small">(nenhum ticket sincronizado ainda)</div>'}
    </div>
    ${
      pendenciaParam && filteredTotal === 0
        ? '<p class="page-lead muted" style="margin-top:1rem;padding:1rem;background:rgba(255,255,255,.85);border-radius:12px;border:1px solid #e2e8f0;">Nenhum chamado com esta pendência no cache. Abra chamados no modal (carrega o histórico GLPI) ou aguarde o enriquecimento após a sincronização.</p>'
        : ""
    }
    <div id="ticket-modal" class="modal" aria-hidden="true">
      <div class="modal-backdrop" data-close-modal></div>
      <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="ticket-modal-title">
        <div class="modal-header">
          <h2 id="ticket-modal-title">Editar chamado</h2>
          <button type="button" class="modal-close" data-close-modal aria-label="Fechar">✕</button>
        </div>
        <form id="ticket-edit-form">
          <input type="hidden" id="ticket-edit-glpi-id" />
          <label class="modal-field">Título
            <input type="text" id="ticket-edit-name" required />
          </label>
          <label class="modal-field modal-field-rich">Descrição
            <div id="ticket-edit-quill" class="ticket-quill-editor" aria-label="Descrição formatada"></div>
          </label>
          <div id="ticket-history-section">
            <div id="ticket-waiting-banner" class="waiting-banner" hidden></div>
            <p class="small" id="ticket-history-api-error" hidden></p>
            <h3 class="history-heading">Histórico (GLPI)</h3>
            <p class="history-help">Linha do tempo: abertura, acompanhamentos e tarefas. O destaque de <strong>pendência</strong> considera a última mensagem <strong>pública</strong> — solicitante → ação da empresa; técnico → em geral aguarda o cliente. Privadas não entram na inferência.</p>
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
          <p class="small modal-hint modal-hint--multiline" id="ticket-edit-requester" style="margin-top:0.35rem"></p>
          <p class="small modal-hint modal-hint--multiline" id="ticket-edit-observers" style="margin-top:0.35rem"></p>
          <p class="small modal-error" id="ticket-edit-error" hidden></p>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" id="ticket-edit-submit">Salvar no GLPI</button>
          </div>
        </form>
      </div>
    </div>
    </div>
    </div>

    <script>
      (function () {
        var root = document.getElementById("kanban-fullscreen-root");
        var btn = document.getElementById("kanban-fs-toggle");
        if (!root || !btn) return;
        function isFs() {
          return document.fullscreenElement === root || document.webkitFullscreenElement === root;
        }
        function syncLabel() {
          var on = isFs();
          btn.setAttribute("aria-pressed", on ? "true" : "false");
          btn.textContent = on ? "Sair da tela inteira" : "Tela inteira";
        }
        function requestFs() {
          if (root.requestFullscreen) {
            return root.requestFullscreen();
          }
          if (root.webkitRequestFullscreen) {
            return root.webkitRequestFullscreen();
          }
          return Promise.reject(new Error("Fullscreen nao suportado neste navegador"));
        }
        function exitFs() {
          if (document.exitFullscreen) {
            return document.exitFullscreen();
          }
          if (document.webkitExitFullscreen) {
            return document.webkitExitFullscreen();
          }
          return Promise.resolve();
        }
        btn.addEventListener("click", function () {
          if (isFs()) {
            void exitFs().catch(function () {});
          } else {
            void requestFs().catch(function () {
              alert("Nao foi possivel entrar em tela inteira. Verifique permissoes do navegador ou tente outro browser.");
            });
          }
        });
        document.addEventListener("fullscreenchange", syncLabel);
        document.addEventListener("webkitfullscreenchange", syncLabel);
        document.addEventListener("keydown", function (e) {
          if (e.key !== "Escape" || !isFs()) return;
          var modal = document.getElementById("ticket-modal");
          if (modal && modal.classList.contains("open")) return;
          void exitFs().catch(function () {});
        });
        syncLabel();
      })();
    </script>

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
        const elRequester = document.getElementById("ticket-edit-requester");
        const elObservers = document.getElementById("ticket-edit-observers");
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
          if (elRequester) elRequester.textContent = "";
          if (elObservers) elObservers.textContent = "";
          renderHistory(null);
          openModal();
          setError("A carregar chamado...");
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
          if (elRequester) {
            var rq = [];
            if (data.requesterName) rq.push("Nome: " + String(data.requesterName));
            if (data.requesterEmail) rq.push("E-mail: " + String(data.requesterEmail));
            if (data.requesterUserId != null && data.requesterUserId !== "")
              rq.push("ID utilizador GLPI: " + String(data.requesterUserId));
            elRequester.textContent =
              rq.length > 0 ? "Solicitante\n" + rq.join("\n") : "Solicitante: nao identificado no cache (sem nome nem ID).";
          }
          if (elObservers) {
            var obs = data.observers || [];
            if (obs.length === 0) {
              elObservers.textContent =
                "Observadores: nenhum encontrado no JSON do GLPI (campos _users_id_observer / team com papel observer). Apos sincronizar com dados completos, abra de novo o chamado.";
            } else {
              var ol = obs.map(function (o) {
                var bits = [];
                if (o.displayName) bits.push(String(o.displayName));
                if (o.email) bits.push(String(o.email));
                if (o.userId != null && o.userId !== "") bits.push("ID " + String(o.userId));
                return bits.length ? "· " + bits.join(" — ") : "· Utilizador #" + String(o.userId != null ? o.userId : "?");
              });
              elObservers.textContent = "Observadores (" + obs.length + ")\n" + ol.join("\n");
            }
          }
          renderHistory(data.history || null);
          setError("");
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
      const openOnly = parsedUrl.searchParams.get("open") === "1";
      const ticketsPendencia = (parsedUrl.searchParams.get("pendencia") || "").trim();
      const ticketsQ = (parsedUrl.searchParams.get("q") || "").trim();
      try {
        const ticketsWhere = buildKanbanWhere({
          q: ticketsQ,
          statusFilter: status,
          groupFilter: group,
          onlyOpen: openOnly,
          pendenciaParam: ticketsPendencia
        });

        const tickets = await prisma.ticket.findMany({
          where: ticketsWhere,
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
    await enrichWaitingPartyBatch(35).catch((error) => {
      logger.warn({ error: toErrorLog(error) }, "Enriquecimento waitingParty ignorado");
    });
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
