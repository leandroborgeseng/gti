import { prisma } from "../config/prisma";
import type { TicketWhereInput } from "../types/ticket-where";
import {
  ticketIdleDaysFloor,
  ticketInOpsOver30PctCohort,
  ticketInOpsOver60PctCohort
} from "./open-ticket-aging";

export type KanbanComputedNarrowOpts = {
  cohort?: "ops_over30" | "ops_over60";
  idleMinDays?: number;
};

function rowMatchesComputed(
  row: { dateCreation: string | null; dateModification: string | null },
  refMs: number,
  opts: KanbanComputedNarrowOpts
): boolean {
  let ok = true;
  if (opts.cohort === "ops_over30") {
    ok = ok && ticketInOpsOver30PctCohort(row.dateCreation, refMs);
  } else if (opts.cohort === "ops_over60") {
    ok = ok && ticketInOpsOver60PctCohort(row.dateCreation, refMs);
  }
  if (opts.idleMinDays != null && opts.idleMinDays > 0) {
    const idle = ticketIdleDaysFloor(row.dateCreation, row.dateModification, refMs);
    ok = ok && idle != null && idle >= opts.idleMinDays;
  }
  return ok;
}

/**
 * Restringe o `where` a tickets que cumprem coorte de idade (KPIs do painel) e/ou inatividade GLPI,
 * usando a mesma lógica que `getOpenTicketOperationalMetrics` (avaliação em memória após um findMany).
 */
export async function narrowTicketWhereByComputedOpts(
  baseWhere: TicketWhereInput,
  opts: KanbanComputedNarrowOpts
): Promise<TicketWhereInput> {
  if (!opts.cohort && (opts.idleMinDays == null || opts.idleMinDays <= 0)) {
    return baseWhere;
  }
  const refMs = Date.now();
  const rows = await prisma.ticket.findMany({
    where: baseWhere,
    select: { glpiTicketId: true, dateCreation: true, dateModification: true }
  });
  const ids = rows.filter((row) => rowMatchesComputed(row, refMs, opts)).map((r) => r.glpiTicketId);
  if (ids.length === 0) {
    return { AND: [baseWhere, { glpiTicketId: { in: [-1] } }] };
  }
  return { AND: [baseWhere, { glpiTicketId: { in: ids } }] };
}
