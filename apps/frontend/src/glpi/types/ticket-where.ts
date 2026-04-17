import type { PrismaClient } from "@prisma/client";

/**
 * Cláusula `where` do modelo `Ticket`.
 * O namespace `Prisma` do cliente gerado na imagem Docker nem sempre exporta `TicketWhereInput`;
 * derivar a partir de `PrismaClient` mantém o build alinhado ao delegate real.
 */
export type TicketWhereInput = NonNullable<Parameters<PrismaClient["ticket"]["findMany"]>[0]>["where"];
