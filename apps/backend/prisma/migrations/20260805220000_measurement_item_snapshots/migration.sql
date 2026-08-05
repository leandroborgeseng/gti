-- Tickets 27–31: snapshots de itens na medição, origem de glosa e vínculo opcional à linha.

CREATE TYPE "MeasurementItemType_new" AS ENUM ('FEATURE', 'SERVICE', 'PRICING_ITEM');

ALTER TABLE "MeasurementItem"
  ALTER COLUMN "type" TYPE "MeasurementItemType_new"
  USING ("type"::text::"MeasurementItemType_new");

DROP TYPE "MeasurementItemType";
ALTER TYPE "MeasurementItemType_new" RENAME TO "MeasurementItemType";

CREATE TYPE "GlosaOrigin" AS ENUM ('AUTOMATIC', 'MANUAL');

ALTER TABLE "MeasurementItem"
  ADD COLUMN "description_snapshot" TEXT,
  ADD COLUMN "unit_value_snapshot" DECIMAL(18, 4),
  ADD COLUMN "billing_kind_snapshot" "ContractPricingBillingKind",
  ADD COLUMN "periodicity_snapshot" "ContractPricingPeriodicity",
  ADD COLUMN "coverage_start" TIMESTAMP(3),
  ADD COLUMN "coverage_end" TIMESTAMP(3),
  ADD COLUMN "calculation_memory" JSONB,
  ADD COLUMN "is_legacy_monthly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "glosed_value" DECIMAL(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE "Glosa"
  ADD COLUMN "measurement_item_id" TEXT,
  ADD COLUMN "origin" "GlosaOrigin" NOT NULL DEFAULT 'MANUAL';

-- Glosas existentes permanecem manuais (compatibilidade).
UPDATE "Glosa" SET "origin" = 'MANUAL' WHERE "origin" IS NULL;

CREATE INDEX "Glosa_measurement_item_id_idx" ON "Glosa"("measurement_item_id");
CREATE INDEX "Glosa_measurementId_origin_idx" ON "Glosa"("measurementId", "origin");

ALTER TABLE "Glosa"
  ADD CONSTRAINT "Glosa_measurement_item_id_fkey"
  FOREIGN KEY ("measurement_item_id") REFERENCES "MeasurementItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
