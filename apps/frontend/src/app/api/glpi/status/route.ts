import { NextResponse } from "next/server";
import { glpiEnvironmentReadiness, glpiEnvPresenceSummary } from "@/glpi/config/glpi-runtime-check";

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
      processCwd: process.cwd(),
      hint:
        "No Railway: as variáveis têm de existir no MESMO serviço que faz deploy do Next (serviço da app → Variables, não só o Postgres). Para DATABASE_URL use «Variable Reference» na UI. Não envolva valores em aspas no campo (ou remova-as). Se templateLiteral for true, a referência Railway não foi resolvida — apague e volte a criar com o picker. Guarde e Redeploy."
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
