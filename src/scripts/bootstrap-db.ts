import { prisma } from "../config/prisma";
import { logger } from "../config/logger";

export async function ensureSqliteSchema(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Ticket" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "glpiTicketId" INTEGER NOT NULL,
      "title" TEXT,
      "content" TEXT,
      "status" TEXT,
      "priority" TEXT,
      "dateCreation" TEXT,
      "contractGroupId" INTEGER,
      "contractGroupName" TEXT,
      "rawJson" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_glpiTicketId_key" ON "Ticket"("glpiTicketId");
  `);

  logger.info("Schema SQLite verificado");
}
