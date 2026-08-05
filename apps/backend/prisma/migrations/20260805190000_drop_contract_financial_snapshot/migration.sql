-- Ticket 20: remove memórias financeiras manuais (ContractFinancialSnapshot).
-- Histórico permanece em AuditLog e ContractAmendment.

DROP TABLE IF EXISTS "ContractFinancialSnapshot";
