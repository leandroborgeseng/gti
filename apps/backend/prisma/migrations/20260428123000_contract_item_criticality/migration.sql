-- CreateEnum
CREATE TYPE "ContractItemCriticality" AS ENUM ('CRITICA', 'ALTA', 'MEDIA', 'BAIXA', 'APOIO');

-- AlterTable
ALTER TABLE "ContractModule"
ADD COLUMN "modulo_criticidade" "ContractItemCriticality" NOT NULL DEFAULT 'MEDIA',
ADD COLUMN "fiscal_responsavel_id" TEXT;

ALTER TABLE "ContractModule"
ALTER COLUMN "weight" TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "ContractFeature"
ADD COLUMN "funcionalidade_criticidade" "ContractItemCriticality" NOT NULL DEFAULT 'MEDIA';

ALTER TABLE "ContractFeature"
ALTER COLUMN "weight" TYPE DECIMAL(18,8);

ALTER TABLE "ContractItemChangeLog"
ADD COLUMN "criticalityBefore" TEXT,
ADD COLUMN "criticalityAfter" TEXT;

-- CreateIndex
CREATE INDEX "ContractModule_fiscal_responsavel_id_idx" ON "ContractModule"("fiscal_responsavel_id");

-- AddForeignKey
ALTER TABLE "ContractModule" ADD CONSTRAINT "ContractModule_fiscal_responsavel_id_fkey" FOREIGN KEY ("fiscal_responsavel_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
