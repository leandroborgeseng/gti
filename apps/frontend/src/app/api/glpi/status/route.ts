import { NextResponse } from "next/server";
import { diagnosticoPlataformaEnv } from "@/glpi/config/env-diagnostics";
import {
  glpiEnvironmentReadiness,
  glpiEnvKeyDiagnostics,
  glpiEnvPresenceSummary
} from "@/glpi/config/glpi-runtime-check";

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
    return jsonUtf8({
      ok: true,
      missingEnv: [],
      sync: {
        isRunning: syncStatus.isRunning,
        runs: syncStatus.runs,
        lastStartedAt: syncStatus.lastStartedAt,
        lastFinishedAt: syncStatus.lastFinishedAt,
        lastSuccessAt: syncStatus.lastSuccessAt,
        lastError: syncStatus.lastError,
        lastLoaded: syncStatus.lastLoaded,
        lastSaved: syncStatus.lastSaved,
        lastFailed: syncStatus.lastFailed,
        lastPage: syncStatus.lastPage
      }
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
