-- AlterTable
ALTER TABLE "Fiscal" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Fiscal_userId_key" ON "Fiscal"("userId");

-- AddForeignKey
ALTER TABLE "Fiscal" ADD CONSTRAINT "Fiscal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
