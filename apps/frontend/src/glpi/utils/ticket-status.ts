import type { TicketWhereInput } from "../types/ticket-where";

function closedStatusFragments(): TicketWhereInput[] {
  return [
    { status: { contains: "Fechado" } },
    { status: { contains: "fechado" } },
    { status: { contains: "Solucionado" } },
    { status: { contains: "solucionado" } },
    { status: { contains: "Resolvido" } },
    { status: { contains: "resolvido" } },
    { status: { contains: "Closed" } },
    { status: { contains: "closed" } },
    { status: { contains: "Solved" } },
    { status: { contains: "solved" } }
  ];
}

/** Heurística alinhada aos filtros da UI (status como texto vindo do GLPI). */
export function isTicketClosedStatus(status: string | null | undefined): boolean {
  const s = (status || "").toLowerCase();
  return (
    s.includes("fechado") ||
    s.includes("solucionado") ||
    s.includes("resolvido") ||
    s.includes("closed") ||
    s.includes("solved")
  );
}

/** Filtro Prisma: status parece fechado (substring). */
export function ticketWhereClosed(): TicketWhereInput {
  return { OR: closedStatusFragments() };
}

/** Filtro Prisma: exclui chamados considerados fechados. */
export function ticketWhereNotClosed(): TicketWhereInput {
  const parts = closedStatusFragments();
  return { NOT: parts.length === 1 ? parts[0]! : { OR: parts } };
}
