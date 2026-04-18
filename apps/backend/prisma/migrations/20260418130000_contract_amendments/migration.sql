-- CreateTable
CREATE TABLE "ContractAmendment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "referenceCode" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "previousTotalValue" DECIMAL(18,2) NOT NULL,
    "previousMonthlyValue" DECIMAL(18,2) NOT NULL,
    "previousEndDate" TIMESTAMP(3) NOT NULL,
    "newTotalValue" DECIMAL(18,2) NOT NULL,
    "newMonthlyValue" DECIMAL(18,2) NOT NULL,
    "newEndDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractAmendment_contractId_createdAt_idx" ON "ContractAmendment"("contractId", "createdAt");

-- AddForeignKey
ALTER TABLE "ContractAmendment" ADD CONSTRAINT "ContractAmendment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
