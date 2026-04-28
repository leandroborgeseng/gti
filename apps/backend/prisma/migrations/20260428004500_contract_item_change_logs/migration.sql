-- CreateEnum
CREATE TYPE "ContractItemChangeAction" AS ENUM ('CREATED', 'DELETED', 'STATUS_CHANGED', 'UPDATED', 'BULK_IMPORTED');

-- CreateEnum
CREATE TYPE "ContractItemChangeType" AS ENUM ('MODULE', 'FEATURE', 'SERVICE');

-- CreateTable
CREATE TABLE "ContractItemChangeLog" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "itemType" "ContractItemChangeType" NOT NULL,
    "itemId" TEXT,
    "itemName" TEXT NOT NULL,
    "action" "ContractItemChangeAction" NOT NULL,
    "statusBefore" TEXT,
    "statusAfter" TEXT,
    "deliveryStatusBefore" TEXT,
    "deliveryStatusAfter" TEXT,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oldData" JSONB,
    "newData" JSONB,

    CONSTRAINT "ContractItemChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractItemChangeLog_contractId_changedAt_idx" ON "ContractItemChangeLog"("contractId", "changedAt");

-- CreateIndex
CREATE INDEX "ContractItemChangeLog_itemType_itemId_idx" ON "ContractItemChangeLog"("itemType", "itemId");

-- CreateIndex
CREATE INDEX "ContractItemChangeLog_action_changedAt_idx" ON "ContractItemChangeLog"("action", "changedAt");

-- AddForeignKey
ALTER TABLE "ContractItemChangeLog" ADD CONSTRAINT "ContractItemChangeLog_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
