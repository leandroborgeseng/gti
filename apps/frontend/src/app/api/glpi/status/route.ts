import { NextResponse } from "next/server";
import { diagnosticoPlataformaEnv } from "@/glpi/config/env-diagnostics";
import {
  glpiEnvironmentReadiness,
  glpiEnvKeyDiagnostics,
  glpiEnvPresenceSummary
} from "@/glpi/config/glpi-runtime-check";
import {
  mergeGlpiSyncStatusForApi,
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
    const dbRead = await readGlpiSyncStatusFromDbDetailed();
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
      avisos.push(
        "Nenhum registo persistido em SyncState ainda: o arranque GLPI pode não ter corrido, falhou antes da primeira gravação, ou este contentor usa outra DATABASE_URL que a instância que sincroniza."
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
        prismaErro: dbRead.erroPrisma
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
