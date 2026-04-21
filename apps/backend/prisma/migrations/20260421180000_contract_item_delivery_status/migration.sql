-- Estado de entrega por item (funcionalidade) para acompanhamento da prestação contratual.
CREATE TYPE "ContractItemDeliveryStatus" AS ENUM ('NOT_DELIVERED', 'PARTIALLY_DELIVERED', 'DELIVERED');

ALTER TABLE "ContractFeature" ADD COLUMN "deliveryStatus" "ContractItemDeliveryStatus" NOT NULL DEFAULT 'NOT_DELIVERED';

UPDATE "ContractFeature"
SET "deliveryStatus" = CASE
  WHEN "status" IN ('DELIVERED', 'VALIDATED') THEN 'DELIVERED'::"ContractItemDeliveryStatus"
  WHEN "status" = 'IN_PROGRESS' THEN 'PARTIALLY_DELIVERED'::"ContractItemDeliveryStatus"
  ELSE 'NOT_DELIVERED'::"ContractItemDeliveryStatus"
END;
