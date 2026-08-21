-- Histórico temporal de entrega das funcionalidades (ticket 96).
ALTER TABLE "ContractFeature" ADD COLUMN IF NOT EXISTS "delivery_effective_date" DATE;
ALTER TABLE "ContractFeature" ADD COLUMN IF NOT EXISTS "partial_delivery_percent" INTEGER;

DO $$ BEGIN
  CREATE TYPE "ContractFeatureDeliveryEventStatus" AS ENUM ('ACTIVE', 'ANNULLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ContractFeatureDeliveryEvent" (
  "id" TEXT NOT NULL,
  "featureId" TEXT NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "deliveryStatus" "ContractItemDeliveryStatus" NOT NULL,
  "percent" INTEGER NOT NULL,
  "note" TEXT,
  "status" "ContractFeatureDeliveryEventStatus" NOT NULL DEFAULT 'ACTIVE',
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT,
  "actorLabel" TEXT,
  "annulledAt" TIMESTAMP(3),
  "annulledById" TEXT,
  "annulledByLabel" TEXT,
  "annulReason" TEXT,
  CONSTRAINT "ContractFeatureDeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContractFeature_deliveryStatus_delivery_effective_date_idx"
  ON "ContractFeature"("deliveryStatus", "delivery_effective_date");

CREATE INDEX IF NOT EXISTS "ContractFeatureDeliveryEvent_featureId_effectiveDate_idx"
  ON "ContractFeatureDeliveryEvent"("featureId", "effectiveDate");

CREATE INDEX IF NOT EXISTS "ContractFeatureDeliveryEvent_featureId_status_effectiveDate_idx"
  ON "ContractFeatureDeliveryEvent"("featureId", "status", "effectiveDate");

DO $$ BEGIN
  ALTER TABLE "ContractFeatureDeliveryEvent"
    ADD CONSTRAINT "ContractFeatureDeliveryEvent_featureId_fkey"
    FOREIGN KEY ("featureId") REFERENCES "ContractFeature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
