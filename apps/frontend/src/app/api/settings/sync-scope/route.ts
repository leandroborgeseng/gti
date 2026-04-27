import { NextResponse } from "next/server";
import { prisma } from "@/glpi/config/prisma";
import { logger } from "@/glpi/config/logger";
import { toErrorLog } from "@/glpi/errors";
import { GLPI_INITIAL_FULL_SYNC_DONE_KEY } from "@/glpi/glpi-sync-state-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { scope?: unknown };
    const scope = body.scope === "all" || body.scope === "ALL" ? "all" : "open";
    await prisma.syncState.upsert({
      where: { key: "ticket_sync_scope" },
      update: { value: scope },
      create: { key: "ticket_sync_scope", value: scope }
    });
    /** Próxima sync agendada volta a ser completa (abertos+fechados) até concluir de novo. */
    await prisma.syncState
      .deleteMany({ where: { key: GLPI_INITIAL_FULL_SYNC_DONE_KEY } })
      .catch(() => {
        /* ignore */
      });
    return NextResponse.json({ ok: true, scope });
  } catch (error) {
    logger.error({ error: toErrorLog(error) }, "Falha ao salvar escopo de sincronização");
    return NextResponse.json({ error: "Falha ao salvar escopo de sincronização" }, { status: 500 });
  }
}
