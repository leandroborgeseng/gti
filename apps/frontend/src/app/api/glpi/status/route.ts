import { NextResponse } from "next/server";
import { glpiEnvironmentReadiness } from "@/glpi/config/glpi-runtime-check";

/**
 * Estado da integração GLPI (diagnóstico em produção / Railway).
 * Não expõe segredos; indica variáveis em falta e último estado do cron/sync.
 */
export async function GET(): Promise<NextResponse> {
  const readiness = glpiEnvironmentReadiness();
  if (!readiness.ok) {
    return NextResponse.json(
      {
        ok: false,
        missingEnv: readiness.missing,
        hint: "Defina estas variáveis no serviço (Railway) e redeploy. O arranque GLPI ignora-se se faltar alguma."
      },
      { status: 200 }
    );
  }

  try {
    const { syncStatus } = await import("@/glpi/sync-cron");
    return NextResponse.json({
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
    return NextResponse.json(
      {
        ok: false,
        missingEnv: [],
        loadError: msg,
        hint: "Erro ao carregar o módulo GLPI (ver logs do servidor)."
      },
      { status: 200 }
    );
  }
}
