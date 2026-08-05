-- Tickets 21–23: aditivos/reajustes por itens, histórico automático e valor global.

CREATE TYPE "ContractAmendmentType" AS ENUM (
  'TERMO_ADITIVO',
  'REAJUSTE',
  'REPACTUACAO',
  'REVISAO',
  'RENOVACAO',
  'PRORROGACAO',
  'ACRESCIMO',
  'SUPRESSAO',
  'APOSTILAMENTO',
  'OUTRO'
);

CREATE TYPE "ContractAmendmentStatus" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TYPE "ContractAmendmentItemAction" AS ENUM ('CREATE', 'UPDATE', 'SUPPRESS');

ALTER TABLE "ContractAmendment"
  ADD COLUMN "type" "ContractAmendmentType" NOT NULL DEFAULT 'OUTRO',
  ADD COLUMN "status" "ContractAmendmentStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "formalizationDate" TIMESTAMP(3),
  ADD COLUMN "previous_global_value" DECIMAL(18, 2),
  ADD COLUMN "new_global_value" DECIMAL(18, 2),
  ADD COLUMN "adjustment_percent" DECIMAL(9, 4),
  ADD COLUMN "index_reference" TEXT,
  ADD COLUMN "cancel_justification" TEXT,
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "actor_id" TEXT,
  ADD COLUMN "actor_label" TEXT;

-- Novos valores podem ser derivados dos itens; legado permanece preenchido.
ALTER TABLE "ContractAmendment"
  ALTER COLUMN "newTotalValue" DROP NOT NULL,
  ALTER COLUMN "newMonthlyValue" DROP NOT NULL,
  ALTER COLUMN "newEndDate" DROP NOT NULL;

-- Compatibilidade: aditivos antigos ficam OUTRO/ACTIVE; efeitos = effectiveDate.
UPDATE "ContractAmendment"
SET
  "type" = 'OUTRO',
  "status" = 'ACTIVE',
  "previous_global_value" = "previousTotalValue",
  "new_global_value" = "newTotalValue"
WHERE "previous_global_value" IS NULL;

CREATE TABLE "contract_amendment_item" (
  "id" TEXT NOT NULL,
  "amendment_id" TEXT NOT NULL,
  "pricing_item_id" TEXT,
  "result_pricing_item_id" TEXT,
  "action" "ContractAmendmentItemAction" NOT NULL,
  "adjustment_percent" DECIMAL(9, 4),
  "before_snapshot" JSONB,
  "after_snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contract_amendment_item_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contract_amendment_item_amendment_id_idx" ON "contract_amendment_item"("amendment_id");
CREATE INDEX "contract_amendment_item_pricing_item_id_idx" ON "contract_amendment_item"("pricing_item_id");

ALTER TABLE "contract_amendment_item"
  ADD CONSTRAINT "contract_amendment_item_amendment_id_fkey"
  FOREIGN KEY ("amendment_id") REFERENCES "ContractAmendment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ContractAmendment_contractId_effectiveDate_idx" ON "ContractAmendment"("contractId", "effectiveDate");
CREATE INDEX "ContractAmendment_status_idx" ON "ContractAmendment"("status");
