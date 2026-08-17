-- Controle genérico de consumo contratual (itens 79–84)

CREATE TYPE "ConsumptionAvailabilityPeriod" AS ENUM (
  'MONTHLY',
  'ANNUAL',
  'CONTRACT_TERM',
  'SPECIFIC_PERIOD',
  'AMENDMENT'
);

CREATE TYPE "ConsumptionFinancialRule" AS ENUM (
  'INCLUDED_IN_MONTHLY',
  'BILLED_BY_CONSUMPTION',
  'CONTRACTED_BY_QUANTITY',
  'BALANCE_ONLY'
);

CREATE TYPE "ConsumptionMovementStatus" AS ENUM (
  'DRAFT',
  'INFORMED',
  'UNDER_VALIDATION',
  'APPROVED',
  'REJECTED',
  'ADJUSTED',
  'REVERSED'
);

CREATE TYPE "ConsumptionMovementSource" AS ENUM (
  'MANUAL',
  'GLPI_TICKET',
  'MEASUREMENT',
  'ADJUSTMENT',
  'AMENDMENT',
  'REVERSAL'
);

ALTER TABLE "contract_pricing_item"
  ADD COLUMN "consumption_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "consumption_financial_rule" "ConsumptionFinancialRule",
  ADD COLUMN "consumption_availability" "ConsumptionAvailabilityPeriod",
  ADD COLUMN "consumption_accumulates" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "consumption_requires_validation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "consumption_alert_thresholds" JSONB;

UPDATE "contract_pricing_item" cpi
SET
  "consumption_enabled" = true,
  "consumption_financial_rule" = CASE
    WHEN cpi."billing_kind" = 'ON_DEMAND' THEN 'BILLED_BY_CONSUMPTION'::"ConsumptionFinancialRule"
    ELSE 'BALANCE_ONLY'::"ConsumptionFinancialRule"
  END,
  "consumption_availability" = 'CONTRACT_TERM'::"ConsumptionAvailabilityPeriod"
WHERE cpi."billing_kind" = 'ON_DEMAND'
   OR EXISTS (
     SELECT 1 FROM "contract_item_type" t
     WHERE t.id = cpi."type_id" AND t."use_in_consumption" = true
   );

CREATE TABLE "contract_consumption_movement" (
  "id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "pricing_item_id" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "original_quantity" DECIMAL(18,4),
  "unit_code_snapshot" TEXT,
  "unit_label_snapshot" TEXT,
  "status" "ConsumptionMovementStatus" NOT NULL DEFAULT 'INFORMED',
  "source" "ConsumptionMovementSource" NOT NULL DEFAULT 'MANUAL',
  "glpi_ticket_id" INTEGER,
  "measurement_id" TEXT,
  "measurement_item_id" TEXT,
  "execution_date" TIMESTAMP(3) NOT NULL,
  "reference_period_start" TIMESTAMP(3),
  "reference_period_end" TIMESTAMP(3),
  "responsible_label" TEXT,
  "responsible_user_id" TEXT,
  "description" TEXT,
  "notes" TEXT,
  "rejection_reason" TEXT,
  "adjustment_justification" TEXT,
  "created_by_id" TEXT,
  "validated_by_id" TEXT,
  "validated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contract_consumption_movement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contract_consumption_movement_contract_id_status_idx"
  ON "contract_consumption_movement"("contract_id", "status");
CREATE INDEX "contract_consumption_movement_pricing_item_id_status_idx"
  ON "contract_consumption_movement"("pricing_item_id", "status");
CREATE INDEX "contract_consumption_movement_glpi_ticket_id_idx"
  ON "contract_consumption_movement"("glpi_ticket_id");
CREATE INDEX "contract_consumption_movement_measurement_id_idx"
  ON "contract_consumption_movement"("measurement_id");
CREATE INDEX "contract_consumption_movement_execution_date_idx"
  ON "contract_consumption_movement"("execution_date");

ALTER TABLE "contract_consumption_movement"
  ADD CONSTRAINT "contract_consumption_movement_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_consumption_movement"
  ADD CONSTRAINT "contract_consumption_movement_pricing_item_id_fkey"
  FOREIGN KEY ("pricing_item_id") REFERENCES "contract_pricing_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
