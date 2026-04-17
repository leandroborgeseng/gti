import { NextResponse } from "next/server";
import {
  glpiEnvironmentReadiness,
  glpiEnvKeyDiagnostics,
  glpiEnvPresenceSummary
} from "@/glpi/config/glpi-runtime-check";

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
      processCwd: process.cwd(),
      hint:
        "No Railway: (1) Variáveis no serviço que corre ESTE deploy (aba Variables desse serviço, não só Postgres). (2) Ao adicionar/editar variáveis, a Railway cria «staged changes» — tem de rever e fazer DEPLOY dessas alterações; sem isso o contentor continua sem as novas variáveis. (3) Redeploy explícito do serviço após aplicar. (4) DATABASE_URL: use referência ao Postgres pela UI. (5) Aspas extra no valor: remova. envChaves.chaveExiste=false em todas ⇒ o processo Node não recebeu nenhuma dessas chaves — quase sempre serviço errado ou alterações por aplicar."
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
