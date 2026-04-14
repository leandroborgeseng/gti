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
        dateModification: string | null;
        updatedAt: Date;
      }> = [];
      let statuses: string[] = [];
      let groups: string[] = [];
      try {
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
            groupFilter || assignedGroupFilter
              ? { contractGroupName: { contains: assignedGroupFilter || groupFilter } }
              : {},
            onlyOpen ? { NOT: [{ status: { contains: "Fechado" } }, { status: { contains: "Solucionado" } }] } : {}
          ]
        };

        latestTickets = await prisma.ticket.findMany({
          where,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 100,
          select: {
            glpiTicketId: true,
            title: true,
            status: true,
            contractGroupName: true,
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
      const orderedStatusKeys = Array.from(new Set([...statuses, ...Array.from(ticketsByStatus.keys())]));
      const kanbanColumnsHtml = orderedStatusKeys
        .map((statusKey) => {
          const cards = ticketsByStatus.get(statusKey) || [];
          const cardsHtml = cards
            .map((ticket) => {
              const safeTitle = escapeHtml(ticket.title || "(sem titulo)");
              const safeGroup = escapeHtml(ticket.contractGroupName || "-");
              return `<div class="kanban-card">
                <div><strong>#${ticket.glpiTicketId}</strong></div>
                <div>${safeTitle}</div>
                <div class="small">Grupo: ${safeGroup}</div>
                <div class="small">Date mod: ${formatDateTime(ticket.dateModification)}</div>
                <div class="small">Sync: ${formatDateTime(ticket.updatedAt)}</div>
              </div>`;
            })
            .join("");
          return `<div class="kanban-column">
            <h3>${escapeHtml(statusKey)} <span class="small">(${cards.length})</span></h3>
            ${cardsHtml || '<div class="small">(sem chamados)</div>'}
          </div>`;
        })
        .join("");
      const statusOptions = statuses
        .map((item) => `<option value="${escapeHtml(item)}" ${item === statusFilter ? "selected" : ""}>${escapeHtml(item)}</option>`)
        .join("");
      const groupOptions = groups
        .map((item) => `<option value="${escapeHtml(item)}" ${item === groupFilter ? "selected" : ""}>${escapeHtml(item)}</option>`)
        .join("");

      const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GLPI Sync MVP</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; color: #222; }
      h1 { margin-bottom: 0.5rem; }
      code { background: #f5f5f5; padding: 0.15rem 0.35rem; border-radius: 4px; }
      ul { line-height: 1.8; }
      .muted { color: #666; font-size: 0.95rem; }
      .filters { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: end; margin: 1rem 0; }
      .filters label { font-size: 0.9rem; display: flex; flex-direction: column; gap: 0.35rem; }
      .filters input, .filters select { padding: 0.35rem 0.5rem; min-width: 180px; }
      .filters button { padding: 0.45rem 0.75rem; }
      .section-title { margin-top: 2rem; margin-bottom: 0.5rem; }
      .small { font-size: 12px; color: #666; }
      .kanban-board { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.8rem; margin-top: 1rem; }
      .kanban-column { border: 1px solid #ddd; border-radius: 8px; padding: 0.6rem; background: #fafafa; min-height: 120px; }
      .kanban-column h3 { margin: 0 0 0.6rem 0; font-size: 14px; }
      .kanban-card { background: #fff; border: 1px solid #e5e5e5; border-radius: 6px; padding: 0.5rem; margin-bottom: 0.5rem; display: flex; flex-direction: column; gap: 0.2rem; }
    </style>
  </head>
  <body>
    <h1>GLPI Sync MVP</h1>
    <p>Servico ativo no Railway.</p>
    <ul>
      <li><a href="/health"><code>GET /health</code></a> - healthcheck</li>
      <li><a href="/tickets"><code>GET /tickets</code></a> - ultimos tickets (JSON)</li>
      <li><code>GET /tickets?limit=10</code> - define quantidade (1..200)</li>
    </ul>
    <p class="muted">Kanban operacional de chamados por status.</p>
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
    <div class="kanban-board">
      ${kanbanColumnsHtml || '<div class="small">(nenhum ticket sincronizado ainda)</div>'}
    </div>
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
      const assignedGroup = (parsedUrl.searchParams.get("assignedGroup") || "").trim();
      const openOnly = parsedUrl.searchParams.get("open") === "1";
      try {
        const tickets = await prisma.ticket.findMany({
          where: {
            AND: [
              status ? { status } : {},
              assignedGroup ? { contractGroupName: { contains: assignedGroup } } : {},
              openOnly ? { NOT: [{ status: { contains: "Fechado" } }, { status: { contains: "Solucionado" } }] } : {}
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
