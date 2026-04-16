-- Cache de sincronização GLPI (Kanban / worker) no mesmo PostgreSQL que a gestão contratual.

CREATE TABLE "Ticket" (
    "id" SERIAL NOT NULL,
    "glpiTicketId" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "status" TEXT,
    "priority" TEXT,
    "dateCreation" TEXT,
    "dateModification" TEXT,
    "contractGroupId" INTEGER,
    "contractGroupName" TEXT,
    "requesterName" TEXT,
    "requesterEmail" TEXT,
    "requesterUserId" INTEGER,
    "waitingParty" TEXT,
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ticket_glpiTicketId_key" ON "Ticket"("glpiTicketId");
CREATE INDEX "Ticket_waitingParty_idx" ON "Ticket"("waitingParty");
CREATE INDEX "Ticket_requesterEmail_idx" ON "Ticket"("requesterEmail");

CREATE TABLE "TicketAttribute" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "keyPath" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "valueText" TEXT,
    "valueJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAttribute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketAttribute_ticketId_keyPath_key" ON "TicketAttribute"("ticketId", "keyPath");
CREATE INDEX "TicketAttribute_keyPath_idx" ON "TicketAttribute"("keyPath");

ALTER TABLE "TicketAttribute" ADD CONSTRAINT "TicketAttribute_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SyncState" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("key")
);
