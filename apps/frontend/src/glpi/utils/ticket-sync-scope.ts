import { prisma } from "../config/prisma";

export type TicketSyncScope = "open" | "all";

export async function getTicketSyncScope(): Promise<TicketSyncScope> {
  const row = await prisma.syncState.findUnique({ where: { key: "ticket_sync_scope" } });
  const v = (row?.value ?? "").trim().toLowerCase();
  /** Só reduz o cache se a equipa salvar explicitamente `open`; caso contrário, cache completo (indicadores de fechados). */
  return v === "open" ? "open" : "all";
}
