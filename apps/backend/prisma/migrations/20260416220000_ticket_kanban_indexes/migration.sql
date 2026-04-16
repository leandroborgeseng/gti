-- Consultas do Kanban: filtros por estado e ordenação por datas.
CREATE INDEX IF NOT EXISTS "Ticket_status_dateCreation_idx" ON "Ticket" ("status", "dateCreation");
CREATE INDEX IF NOT EXISTS "Ticket_dateModification_idx" ON "Ticket" ("dateModification");
