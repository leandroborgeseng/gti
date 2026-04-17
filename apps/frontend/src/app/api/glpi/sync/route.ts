import { NextRequest, NextResponse } from "next/server";
import { glpiEnvironmentReadiness } from "@/glpi/config/glpi-runtime-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CABECALHO_SEGREDO = "x-gti-glpi-sync-secret";

/**
 * Força uma execução completa da sincronização GLPI (útil em produção quando o cron não chegou a correr
 * ou para diagnóstico). Requer `GLPI_SYNC_TRIGGER_SECRET` e o mesmo valor no cabeçalho HTTP.
 *
 * Exemplo: `curl -X POST -H "x-gti-glpi-sync-secret: SEU_SEGREDO" https://host/api/glpi/sync`
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const readiness = glpiEnvironmentReadiness();
  if (!readiness.ok) {
    return NextResponse.json(
      { ok: false, missingEnv: readiness.missing, message: "Ambiente GLPI incompleto." },
      { status: 503 }
    );
  }

  const secret = process.env.GLPI_SYNC_TRIGGER_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Defina a variável de ambiente GLPI_SYNC_TRIGGER_SECRET no serviço (valor longo e aleatório) e envie o mesmo no cabeçalho x-gti-glpi-sync-secret."
      },
      { status: 503 }
    );
  }

  const enviado = req.headers.get(CABECALHO_SEGREDO)?.trim();
  if (!enviado || enviado !== secret) {
    return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
  }

  try {
    const { runSyncWithGuard } = await import("@/glpi/sync-cron");
    await runSyncWithGuard();
    return NextResponse.json({ ok: true, message: "Sincronização GLPI executada." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
