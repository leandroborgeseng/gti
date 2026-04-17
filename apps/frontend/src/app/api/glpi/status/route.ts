import { NextResponse } from "next/server";
import { diagnosticoPlataformaEnv } from "@/glpi/config/env-diagnostics";
import {
  glpiEnvironmentReadiness,
  glpiEnvKeyDiagnostics,
  glpiEnvPresenceSummary
} from "@/glpi/config/glpi-runtime-check";
import {
  mergeGlpiSyncStatusForApi,
  readGlpiBootstrapLastCheckpoint,
  readGlpiSyncStatusFromDbDetailed
} from "@/glpi/glpi-sync-status-persistence";

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
    const { syncStatus } = await import("@/glpi/sync-cron");
    const [dbRead, arranqueGlpiUltimo] = await Promise.all([
      readGlpiSyncStatusFromDbDetailed(),
      readGlpiBootstrapLastCheckpoint()
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
          "Não existe checkpoint de arranque (`glpi_bootstrap_last_v1`). O `register()` do instrumentation pode não ter corrido este bootstrap, ou falhou antes da primeira escrita na base (ver Deploy Logs à procura de «instrumentation» / «Falha no arranque da sincronização GLPI»)."
        );
      } else if (arranqueGlpiUltimo.phase === "instrumentation_pre_bootstrap") {
        avisos.push(
          "Checkpoint «instrumentation_pre_bootstrap» sem progressão — o import de `sync-cron` ou o `bootstrapGlpiSyncInNext` pode ter falhado (ver Deploy Logs com stack trace)."
        );
      } else if (arranqueGlpiUltimo.phase === "after_run_sync" && !dbRead.linhaComValor) {
        avisos.push(
          "O arranque chegou a «after_run_sync», mas não há linha de estado da sync — as gravações em `glpi_sync_status_v1` podem estar a falhar (ver logs «Não foi possível persistir o estado da sincronização»)."
        );
      } else if (
        (arranqueGlpiUltimo.phase === "after_token" ||
          arranqueGlpiUltimo.phase === "before_run_sync") &&
        !Number.isNaN(Date.parse(arranqueGlpiUltimo.at)) &&
        Date.now() - Date.parse(arranqueGlpiUltimo.at) > 120_000
      ) {
        avisos.push(
          `O último checkpoint («${arranqueGlpiUltimo.phase}») tem mais de 2 minutos — a primeira sincronização pode estar bloqueada (GLPI lento, rede ou exceção sem atualizar o checkpoint).`
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
        arranqueGlpiUltimaFaseEm: arranqueGlpiUltimo?.at ?? null
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
