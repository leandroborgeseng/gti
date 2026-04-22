import { NextRequest, NextResponse } from "next/server";
import { glpiEnvironmentReadiness } from "@/glpi/config/glpi-runtime-check";
import { getTicketSyncScope } from "@/glpi/utils/ticket-sync-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CABECALHO_SEGREDO = "x-gti-glpi-sync-secret";

type ForcedSyncMode = "full" | "abertos" | "fechados";

function normalizeModeToken(raw: string | undefined | null): ForcedSyncMode | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "fechados" || s === "closed" || s === "encerrados") return "fechados";
  if (s === "abertos" || s === "open" || s === "ativos") return "abertos";
  if (s === "full" || s === "completo" || s === "tudo") return "full";
  return null;
}

async function parseForcedSyncMode(req: NextRequest): Promise<ForcedSyncMode> {
  const url = new URL(req.url);
  const fromQuery =
    normalizeModeToken(url.searchParams.get("mode")) ?? normalizeModeToken(url.searchParams.get("modo"));
  if (fromQuery) return fromQuery;

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return "full";
  }
  try {
    const body = (await req.json()) as { mode?: unknown; modo?: unknown };
    const fromBody =
      normalizeModeToken(typeof body.mode === "string" ? body.mode : null) ??
      normalizeModeToken(typeof body.modo === "string" ? body.modo : null);
    return fromBody ?? "full";
  } catch {
    return "full";
  }
}

/**
 * Força uma execução da sincronização GLPI (útil em produção quando o cron não chegou a correr
 * ou para diagnóstico). Requer `GLPI_SYNC_TRIGGER_SECRET` e o mesmo valor no cabeçalho HTTP.
 *
 * Modos (query `?mode=` ou JSON `{ "mode": "..." }` / `{ "modo": "..." }`):
 * - omitido / `full` / `completo`: igual à primeira sync — abertos e fechados (conforme escopo na BD).
 * - `abertos` / `open`: só persiste chamados **não fechados** (útil com escopo «todos» para refrescar o Kanban).
 * - `fechados` / `closed`: só persiste **fechados** (exige escopo «todos os tickets» na BD).
 *
 * Exemplos:
 * - `curl -X POST -H "x-gti-glpi-sync-secret: SEU_SEGREDO" "https://host/api/glpi/sync?mode=fechados"`
 * - `curl -X POST -H "x-gti-glpi-sync-secret: SEU_SEGREDO" -H "Content-Type: application/json" -d '{"mode":"fechados"}' https://host/api/glpi/sync`
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
    const mode = await parseForcedSyncMode(req);
    const { runSyncWithGuard } = await import("@/glpi/sync-cron");
    const scope = await getTicketSyncScope();

    if (mode === "fechados" && scope !== "all") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Para forçar o carregamento de fechados, o escopo na BD tem de ser «todos os tickets» (Cache no quadro de chamados → Guardar escopo). Com «só abertos», o cache não guarda fechados."
        },
        { status: 400 }
      );
    }

    if (mode === "fechados") {
      await runSyncWithGuard({ persistFilter: "closed", enrichWaitingParty: false });
      return NextResponse.json({
        ok: true,
        mode: "fechados",
        message: "Passagem só de chamados fechados executada (percorre o GLPI e grava fechados no cache)."
      });
    }

    if (mode === "abertos") {
      await runSyncWithGuard({ persistFilter: "open", enrichWaitingParty: true });
      return NextResponse.json({
        ok: true,
        mode: "abertos",
        message: "Passagem só de chamados abertos executada."
      });
    }

    await runSyncWithGuard();
    return NextResponse.json({ ok: true, mode: "full", message: "Sincronização GLPI completa executada." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
