import type { Prisma } from "../../../../backend/node_modules/.prisma/client";

/**
 * Cláusula `where` do modelo `Ticket`.
 * O `@prisma/client` hoisted na raiz do monorepo (Docker) aponta para um default sem o namespace completo;
 * os tipos oficiais vivem no output do `generator` do schema: `apps/backend/node_modules/.prisma/client`.
 */
export type TicketWhereInput = Prisma.TicketWhereInput;
