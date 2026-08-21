-- Códigos de validação pública no documento (evolução tickets 101/103).
ALTER TABLE "contract_notification" ADD COLUMN IF NOT EXISTS "document_verifier_code" TEXT;
ALTER TABLE "contract_notification" ADD COLUMN IF NOT EXISTS "document_validation_code" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "contract_notification_document_verifier_code_key"
  ON "contract_notification"("document_verifier_code");
