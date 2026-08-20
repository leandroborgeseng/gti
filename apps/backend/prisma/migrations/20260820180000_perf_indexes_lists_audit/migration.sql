-- Índices de desempenho para listagens e filtros frequentes.
CREATE INDEX IF NOT EXISTS "ContractModule_contractId_idx" ON "ContractModule"("contractId");

CREATE INDEX IF NOT EXISTS "Measurement_deletedAt_status_idx" ON "Measurement"("deletedAt", "status");
CREATE INDEX IF NOT EXISTS "Measurement_status_referenceYear_referenceMonth_idx" ON "Measurement"("status", "referenceYear", "referenceMonth");

CREATE INDEX IF NOT EXISTS "MeasurementItem_measurementId_idx" ON "MeasurementItem"("measurementId");

CREATE INDEX IF NOT EXISTS "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_action_timestamp_idx" ON "AuditLog"("action", "timestamp");

CREATE INDEX IF NOT EXISTS "TicketGovernance_contractId_idx" ON "TicketGovernance"("contractId");

CREATE INDEX IF NOT EXISTS "GoalAction_goalId_idx" ON "GoalAction"("goalId");
