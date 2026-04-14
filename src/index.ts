import http from "node:http";
import cron from "node-cron";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { syncTickets } from "./jobs/sync-tickets.job";
import { ensureSqliteSchema } from "./scripts/bootstrap-db";
import { loadOpenApiSpec } from "./services/openapi.loader";
import { getAccessToken } from "./services/auth.service";

let isSyncRunning = false;

function startHealthServer(): void {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("GLPI Sync Running");
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
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
  try {
    await syncTickets();
  } catch (error) {
    logger.error({ error }, "Falha na sincronizacao de tickets");
  } finally {
    isSyncRunning = false;
  }
}

async function main(): Promise<void> {
  await ensureSqliteSchema();
  await loadOpenApiSpec();
  await getAccessToken();

  await runSyncWithGuard();

  cron.schedule(env.CRON_EXPRESSION, async () => {
    await runSyncWithGuard();
  });

  logger.info({ cron: env.CRON_EXPRESSION }, "Cron de sincronizacao iniciado");
  startHealthServer();
}

main()
  .catch((error) => {
    logger.error({ error }, "Erro fatal na inicializacao");
    process.exit(1);
  });
