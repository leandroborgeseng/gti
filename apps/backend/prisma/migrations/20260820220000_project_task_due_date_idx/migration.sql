-- Índice para filtros de tarefas atrasadas (listagem/dashboard de projetos).
CREATE INDEX IF NOT EXISTS "ProjectTask_dueDate_idx" ON "ProjectTask"("dueDate");
