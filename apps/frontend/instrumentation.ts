import { glpiEnvironmentReadiness } from "./src/glpi/config/glpi-runtime-check";

/**
 * Arranque GLPI em segundo plano: não bloqueia o `next start` (health checks da Railway).
 * Erros passam a `console.error` com stack para aparecer nos Deploy Logs.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }
  console.info("[instrumentation] register() executado (GLPI)");
  if (process.env.GLPI_SKIP_BOOTSTRAP === "1") {
    console.info("[instrumentation] GLPI_SKIP_BOOTSTRAP=1 — sincronização GLPI não arranca (normal só no build).");
    return;
  }

  const readiness = glpiEnvironmentReadiness();
  if (!readiness.ok) {
    console.warn(
      "[instrumentation] GLPI desativado: faltam variáveis de ambiente:",
      readiness.missing.join(", "),
      "— defina-as no painel e reinicie o serviço."
    );
    return;
  }

  console.info("[instrumentation] A agendar bootstrap GLPI (sync-cron)…");
  void import("./src/glpi/sync-cron")
    .then((mod) => mod.bootstrapGlpiSyncInNext())
    .catch((error) => {
      console.error("[instrumentation] Falha no arranque da sincronização GLPI:", error);
    });
}
