import { NextResponse } from "next/server";
import { prisma } from "@/glpi/config/prisma";
import { logger } from "@/glpi/config/logger";
import { toErrorLog } from "@/glpi/errors";
import { buildKanbanWhere, parseOpsCohortParam, type KanbanFilterInput } from "@/glpi/utils/kanban-filters";
import { narrowTicketWhereByComputedOpts } from "@/glpi/utils/kanban-narrow-computed";
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
    const onlyOpenRaw = body.open === true || body.open === 1 || body.open === "1";
    const cohortParam = typeof body.cohort === "string" ? body.cohort : "";
    const idleMinRaw = typeof body.idleMin === "string" ? body.idleMin : "";
    const groupInJson = typeof body.groupInJson === "string" ? body.groupInJson : "";
    const groupNull = body.groupNull === true || body.groupNull === 1 || body.groupNull === "1";
    const cohort = parseOpsCohortParam(cohortParam);
    const idleMinDays = Number.parseInt(String(idleMinRaw).trim(), 10);
    const idleOk = Number.isFinite(idleMinDays) && idleMinDays > 0 ? idleMinDays : undefined;
    let groupInNames: string[] | undefined;
    try {
      const v = groupInJson.trim() ? (JSON.parse(groupInJson) as unknown) : null;
      groupInNames = Array.isArray(v) && v.length > 0 ? v.map((x) => String(x)) : undefined;
    } catch {
      groupInNames = undefined;
    }
    const drillSlice = Boolean(
      cohort ||
        idleOk ||
        (groupInNames && groupInNames.length > 0) ||
        (groupNull && !(groupInNames && groupInNames.length > 0))
    );
    const onlyOpen = onlyOpenRaw || drillSlice;
    const filterBase: KanbanFilterInput = {
      q,
      statusFilter,
      groupFilter,
      onlyOpen,
      pendenciaParam,
      requesterEmail: requesterEmail || undefined,
      requesterName: requesterName || undefined,
      groupInNames: groupInNames && groupInNames.length > 0 ? groupInNames : undefined,
      groupNullOnly:
        groupInNames && groupInNames.length > 0 ? undefined : groupNull ? true : undefined
    };
    let where = buildKanbanWhere(filterBase);
    where = await narrowTicketWhereByComputedOpts(where, {
      cohort: cohort ?? undefined,
      idleMinDays: idleOk
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
