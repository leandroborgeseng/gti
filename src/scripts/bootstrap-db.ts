import { prisma } from "../config/prisma";
import { logger } from "../config/logger";

async function addColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition};`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column name/i.test(message)) {
      throw error;
    }
  }
}

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
      "dateModification" TEXT,
      "contractGroupId" INTEGER,
      "contractGroupName" TEXT,
      "rawJson" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME
    );
  `);

  await addColumnIfMissing("Ticket", "dateModification", "TEXT");
  await addColumnIfMissing("Ticket", "updatedAt", "DATETIME");
  await addColumnIfMissing("Ticket", "waitingParty", "TEXT");
  await addColumnIfMissing("Ticket", "requesterName", "TEXT");
  await addColumnIfMissing("Ticket", "requesterEmail", "TEXT");
  await addColumnIfMissing("Ticket", "requesterUserId", "INTEGER");

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_glpiTicketId_key" ON "Ticket"("glpiTicketId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Ticket_requesterEmail_idx" ON "Ticket"("requesterEmail");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TicketAttribute" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "ticketId" INTEGER NOT NULL,
      "keyPath" TEXT NOT NULL,
      "valueType" TEXT NOT NULL,
      "valueText" TEXT,
      "valueJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME,
      FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "TicketAttribute_ticketId_keyPath_key" ON "TicketAttribute"("ticketId", "keyPath");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TicketAttribute_keyPath_idx" ON "TicketAttribute"("keyPath");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SyncState" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" TEXT,
      "updatedAt" DATETIME
    );
  `);

  logger.info("Schema SQLite verificado");
}
