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
      let ticketsCount = 0;
      let latestTickets: Array<{ glpiTicketId: number; title: string | null; createdAt: Date }> = [];
      try {
        ticketsCount = await prisma.ticket.count();
        latestTickets = await prisma.ticket.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            glpiTicketId: true,
            title: true,
            createdAt: true
          }
        });
      } catch (error) {
        logger.error({ error: toErrorLog(error) }, "Falha ao carregar dados da pagina inicial");
      }

      const statusColor = syncStatus.lastError ? "#8a1f1f" : "#1f6f43";
      const statusLabel = syncStatus.lastError ? "Ultima sync com erro" : "Ultima sync sem erro";
      const rows = latestTickets
        .map((ticket) => {
          const safeTitle = (ticket.title || "(sem titulo)")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
          return `<tr><td>${ticket.glpiTicketId}</td><td>${safeTitle}</td><td>${ticket.createdAt.toISOString()}</td></tr>`;
        })
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
      .status { padding: 0.75rem; border-radius: 6px; color: #fff; margin: 1rem 0; background: ${statusColor}; }
      table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
      th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; font-size: 14px; }
      th { background: #f7f7f7; }
      .muted { color: #666; font-size: 0.95rem; }
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
    <div class="status">
      <strong>${statusLabel}</strong><br />
      running: ${syncStatus.isRunning} | runs: ${syncStatus.runs}<br />
      page: ${syncStatus.lastPage}<br />
      loaded: ${syncStatus.lastLoaded} | saved: ${syncStatus.lastSaved} | failed: ${syncStatus.lastFailed}<br />
      started_at: ${syncStatus.lastStartedAt || "-"} | finished_at: ${syncStatus.lastFinishedAt || "-"}<br />
      last_success_at: ${syncStatus.lastSuccessAt || "-"}<br />
      last_error: ${syncStatus.lastError || "-"}
    </div>
    <p class="muted">Tickets salvos no banco: ${ticketsCount}</p>
    <table>
      <thead>
        <tr>
          <th>GLPI ID</th>
          <th>Titulo</th>
          <th>Salvo em</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="3">(nenhum ticket sincronizado ainda)</td></tr>'}
      </tbody>
    </table>
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
      try {
        const tickets = await prisma.ticket.findMany({
          orderBy: { id: "desc" },
          take: limit
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
