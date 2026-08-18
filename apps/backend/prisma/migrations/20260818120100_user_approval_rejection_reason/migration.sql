-- Justificativa administrativa na recusa de solicitação de acesso (ticket 89)

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "approval_rejection_reason" TEXT;
