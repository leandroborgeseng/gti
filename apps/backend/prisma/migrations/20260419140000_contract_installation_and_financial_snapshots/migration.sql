-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "installationValue" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "ContractFinancialSnapshot" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monthlyValue" DECIMAL(18,2) NOT NULL,
    "totalValue" DECIMAL(18,2) NOT NULL,
    "installationValue" DECIMAL(18,2),
    "note" TEXT,

    CONSTRAINT "ContractFinancialSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractFinancialSnapshot_contractId_recordedAt_idx" ON "ContractFinancialSnapshot"("contractId", "recordedAt");

-- AddForeignKey
ALTER TABLE "ContractFinancialSnapshot" ADD CONSTRAINT "ContractFinancialSnapshot_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
