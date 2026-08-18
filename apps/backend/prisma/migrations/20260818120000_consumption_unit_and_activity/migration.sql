-- Separação financeiro × consumo (91) + estimado/situação de atividade (92)

CREATE TYPE "ConsumptionActivityStatus" AS ENUM (
  'SURVEY',
  'AWAITING_APPROVAL',
  'APPROVED_FOR_EXECUTION',
  'IN_DEVELOPMENT',
  'IN_VALIDATION',
  'COMPLETED',
  'CANCELLED',
  'SUSPENDED'
);

ALTER TABLE "contract_pricing_item"
  ADD COLUMN "consumption_unit_id" TEXT,
  ADD COLUMN "consumption_available_quantity" DECIMAL(18,4);

ALTER TABLE "contract_pricing_item"
  ADD CONSTRAINT "contract_pricing_item_consumption_unit_id_fkey"
  FOREIGN KEY ("consumption_unit_id") REFERENCES "measure_unit"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "contract_pricing_item_consumption_unit_id_idx"
  ON "contract_pricing_item"("consumption_unit_id");

ALTER TABLE "contract_consumption_movement"
  ADD COLUMN "estimated_quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN "activity_status" "ConsumptionActivityStatus" NOT NULL DEFAULT 'SURVEY',
  ADD COLUMN "start_date" TIMESTAMP(3);

CREATE INDEX "contract_consumption_movement_pricing_item_id_activity_status_idx"
  ON "contract_consumption_movement"("pricing_item_id", "activity_status");
