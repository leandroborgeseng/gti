import { NextResponse } from "next/server";
import { prisma } from "@/glpi/config/prisma";
import { logger } from "@/glpi/config/logger";
import { toErrorLog } from "@/glpi/errors";

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
    return NextResponse.json({ ok: true, scope });
  } catch (error) {
    logger.error({ error: toErrorLog(error) }, "Falha ao guardar escopo de sincronização");
    return NextResponse.json({ error: "Falha ao guardar escopo de sincronização" }, { status: 500 });
  }
}
