import { NextResponse } from "next/server";
import { prisma } from "@/glpi/config/prisma";
import { logger } from "@/glpi/config/logger";
import { toErrorLog } from "@/glpi/errors";
import { buildKanbanWhere } from "@/glpi/utils/kanban-filters";
import { loadAndPersistWaitingParty } from "@/glpi/services/glpi-ticket-history.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const q = typeof body.q === "string" ? body.q : "";
    const statusFilter = typeof body.status === "string" ? body.status : "";
    const groupFilter = typeof body.group === "string" ? body.group : "";
    const pendenciaParam = typeof body.pendencia === "string" ? body.pendencia : "";
    const requesterEmail = typeof body.requesterEmail === "string" ? body.requesterEmail.trim() : "";
    const requesterName = typeof body.requesterName === "string" ? body.requesterName.trim() : "";
    const onlyOpen = body.open === true || body.open === 1 || body.open === "1";
    const where = buildKanbanWhere({
      q,
      statusFilter,
      groupFilter,
      onlyOpen,
      pendenciaParam,
      requesterEmail: requesterEmail || undefined,
      requesterName: requesterName || undefined
    });
    const rows = await prisma.ticket.findMany({
      where,
      select: { glpiTicketId: true, status: true },
      orderBy: [{ dateCreation: "asc" }, { glpiTicketId: "asc" }],
      take: 200
    });
    let updated = 0;
    for (const row of rows) {
      await loadAndPersistWaitingParty(row.glpiTicketId, row.status);
      updated += 1;
    }
    return NextResponse.json({ ok: true, updated, scanned: rows.length });
  } catch (error) {
    logger.error({ error: toErrorLog(error) }, "Falha ao recalcular pendência");
    return NextResponse.json({ error: "Falha ao recalcular pendência" }, { status: 500 });
  }
}
