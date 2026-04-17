import { NextResponse } from "next/server";
import { diagnosticoPlataformaEnv } from "@/glpi/config/env-diagnostics";
import {
  glpiEnvironmentReadiness,
  glpiEnvKeyDiagnostics,
  glpiEnvPresenceSummary
} from "@/glpi/config/glpi-runtime-check";
import {
  mergeGlpiSyncStatusForApi,
  readGlpiBootstrapDoneAt,
  readGlpiBootstrapLastCheckpoint,
  readGlpiSyncStatusFromDbDetailed
} from "@/glpi/glpi-sync-status-persistence";

const FASES_ARRANQUE_PARCIAIS = new Set([
  "bootstrap_enter",
  "after_ensure_db",
  "before_openapi_doc",
  "after_openapi",
  "after_token",
  "before_run_sync"
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_UTF8 = { "content-type": "application/json; charset=utf-8" } as const;

function jsonUtf8(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: JSON_UTF8 });
}

/**
 * Estado da integração GLPI (diagnóstico em produção / Railway).
 * Não expõe segredos; indica variáveis em falta e último estado do cron/sync.
 */
export async function GET(): Promise<NextResponse> {
  const readiness = glpiEnvironmentReadiness();
  if (!readiness.ok) {
    return jsonUtf8({
      ok: false,
      missingEnv: readiness.missing,
      unexpandedReferences: readiness.unexpandedReferences,
      envPresence: glpiEnvPresenceSummary(),
      envChaves: glpiEnvKeyDiagnostics(),
      plataforma: diagnosticoPlataformaEnv(),
      processCwd: process.cwd(),
      hint:
        "Veja `plataforma`: se `railway.*` vier tudo false, este contentor pode não ser um deploy Railway normal. Se `gtiEnvJsonDefinida` for false, a variável `GTI_ENV_JSON` não existe neste processo (crie-a neste serviço, aplique alterações e redeploy). Se for true mas `missingEnv` continuar, o JSON está inválido ou as chaves têm nomes errados. Variáveis soltas no painel também precisam estar neste mesmo serviço e aplicadas antes do redeploy."
    });
  }

  try {
    const mod = await import("@/glpi/sync-cron");
    /** Rede de segurança: em alguns ambientes o `instrumentation.register()` não corre; o mesmo bootstrap é deduplicado em `globalThis`. */
    void mod.bootstrapGlpiSyncInNext().catch((error) => {
      console.error("[GTI] Garantia de arranque GLPI (após GET /api/glpi/status):", error);
    });
    const { syncStatus } = mod;
    const [dbRead, arranqueGlpiUltimo, arranqueGlpiBootstrapConcluidoEm] = await Promise.all([
      readGlpiSyncStatusFromDbDetailed(),
      readGlpiBootstrapLastCheckpoint(),
      readGlpiBootstrapDoneAt()
    ]);
    const fromDb = dbRead.snapshot;
    const merged = mergeGlpiSyncStatusForApi(fromDb, { ...syncStatus });
    const { persistedAt: _persistedAt, ...sync } = merged;

    const avisos: string[] = [];
    if (process.env.GLPI_SKIP_BOOTSTRAP === "1") {
      avisos.push(
        "GLPI_SKIP_BOOTSTRAP=1 neste processo: o instrumentation não arranca a sincronização (esperado no build; no runtime do serviço web remove esta variável ou use um worker com bootstrap ativo)."
      );
    }
    if (dbRead.erroPrisma) {
      avisos.push(`Falha ao ler SyncState na base: ${dbRead.erroPrisma}`);
    } else if (dbRead.parseInvalido) {
      avisos.push(
        "Existe valor em SyncState para a chave de estado GLPI, mas o JSON é inválido ou não contém `runs` numérico."
      );
    } else if (!dbRead.linhaComValor && sync.runs === 0 && process.env.GLPI_SKIP_BOOTSTRAP !== "1") {
      if (!arranqueGlpiUltimo) {
        avisos.push(
          "Não existe checkpoint de arranque (`glpi_bootstrap_last_v1`) ainda. Este pedido também disparou o bootstrap GLPI (deduplicado com o instrumentation). Volte a chamar este URL dentro de alguns segundos. Se continuar vazio, veja Deploy Logs: «register() executado», «A agendar bootstrap» ou erros Prisma antes da primeira escrita."
        );
      } else if (arranqueGlpiUltimo.phase === "instrumentation_pre_bootstrap") {
        avisos.push(
          "Checkpoint legado «instrumentation_pre_bootstrap» — redeploy com a versão atual do código ou ver Deploy Logs por falhas no import do `sync-cron`."
        );
      } else if (
        arranqueGlpiUltimo.phase === "first_sync_delegated" &&
        !dbRead.linhaComValor &&
        !Number.isNaN(Date.parse(arranqueGlpiUltimo.at)) &&
        Date.now() - Date.parse(arranqueGlpiUltimo.at) > 600_000
      ) {
        avisos.push(
          "A primeira sync foi lançada em segundo plano há mais de 10 minutos e ainda não há estado persistido — falha na sync ou na escrita em SyncState (ver Deploy Logs: «Primeira sincronização GLPI em segundo plano» ou erro Prisma). Pode forçar uma sync com POST /api/glpi/sync e o cabeçalho x-gti-glpi-sync-secret (variável GLPI_SYNC_TRIGGER_SECRET)."
        );
      } else if (
        arranqueGlpiUltimo.phase === "after_ensure_db" &&
        !Number.isNaN(Date.parse(arranqueGlpiUltimo.at)) &&
        Date.now() - Date.parse(arranqueGlpiUltimo.at) > 35_000
      ) {
        avisos.push(
          "Checkpoint «after_ensure_db» antigo: o arranque costumava ficar preso no download do OpenAPI (`GLPI_DOC_URL`). Com o limite de ~25s isso deve libertar; confirme que o contentor alcança o URL do doc (firewall, DNS, TLS) e que `GLPI_DOC_URL` está correto para a v2 do GLPI."
        );
      } else if (
        (arranqueGlpiUltimo.phase === "after_token" ||
          arranqueGlpiUltimo.phase === "before_run_sync" ||
          arranqueGlpiUltimo.phase === "before_openapi_doc") &&
        !Number.isNaN(Date.parse(arranqueGlpiUltimo.at)) &&
        Date.now() - Date.parse(arranqueGlpiUltimo.at) > 120_000
      ) {
        avisos.push(
          `O último checkpoint («${arranqueGlpiUltimo.phase}») tem mais de 2 minutos — o arranque pode estar preso antes de delegar a sync (ver Deploy Logs).`
        );
      } else if (arranqueGlpiUltimo.phase === "bootstrap_done" && !dbRead.linhaComValor) {
        avisos.push(
          "Arranque concluído (`bootstrap_done`) sem estado de sync na base — possível base nova ou `DATABASE_URL` diferente entre o arranque e este pedido, ou falhas repetidas ao persistir só a chave de estado da sync."
        );
      } else {
        avisos.push(
          `Último checkpoint de arranque: «${arranqueGlpiUltimo.phase}» em ${arranqueGlpiUltimo.at}. Ainda não há estado persistido da sincronização; confira Deploy Logs e conectividade com o GLPI.`
        );
      }
    }

    if (
      arranqueGlpiUltimo &&
      sync.lastStartedAt &&
      FASES_ARRANQUE_PARCIAIS.has(arranqueGlpiUltimo.phase) &&
      !Number.isNaN(Date.parse(arranqueGlpiUltimo.at)) &&
      !Number.isNaN(Date.parse(sync.lastStartedAt)) &&
      Date.parse(arranqueGlpiUltimo.at) > Date.parse(sync.lastStartedAt)
    ) {
      avisos.push(
        "O checkpoint de arranque na BD é mais recente que o início da sync atual — é provável haver mais do que uma réplica a escrever na mesma base. Use 1 réplica para o serviço Next ou defina GLPI_CRON_DISABLED=1 nas réplicas só HTTP e um único worker de sync."
      );
    }

    return jsonUtf8({
      ok: true,
      missingEnv: [],
      sync,
      diagnosticoSync: {
        glpiSkipBootstrap: process.env.GLPI_SKIP_BOOTSTRAP === "1",
        glpiCronDisabled: process.env.GLPI_CRON_DISABLED === "1",
        syncStateLinhaComValor: dbRead.linhaComValor,
        syncStateComprimentoValor: dbRead.comprimentoValor,
        syncStateParseInvalido: dbRead.parseInvalido,
        prismaErro: dbRead.erroPrisma,
        arranqueGlpiUltimaFase: arranqueGlpiUltimo?.phase ?? null,
        arranqueGlpiUltimaFaseEm: arranqueGlpiUltimo?.at ?? null,
        arranqueGlpiBootstrapConcluidoEm: arranqueGlpiBootstrapConcluidoEm
      },
      avisos: avisos.length ? avisos : undefined
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonUtf8({
      ok: false,
      missingEnv: [],
      loadError: msg,
      hint: "Erro ao carregar o módulo GLPI (ver Deploy Logs do serviço Next)."
    });
  }
}
