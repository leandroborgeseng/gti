-- Técnico atribuído (GLPI) para filtros no Kanban / chamados
ALTER TABLE "Ticket" ADD COLUMN "assignedUserId" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "assignedUserName" TEXT;

CREATE INDEX "Ticket_assignedUserId_idx" ON "Ticket"("assignedUserId");
