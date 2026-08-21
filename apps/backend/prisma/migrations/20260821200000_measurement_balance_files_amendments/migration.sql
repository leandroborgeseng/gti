-- Tickets 98/99/105: medições (memória/data), ações de aditivo, aba Arquivos.

ALTER TABLE "Measurement" ADD COLUMN IF NOT EXISTS "reference_date" DATE;
ALTER TABLE "Measurement" ADD COLUMN IF NOT EXISTS "balance_memory" JSONB;
ALTER TABLE "Measurement" ADD COLUMN IF NOT EXISTS "feature_delivery_snapshot" JSONB;

DO $$ BEGIN
  ALTER TYPE "ContractAmendmentItemAction" ADD VALUE IF NOT EXISTS 'INCREASE_QUANTITY';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "ContractAmendmentItemAction" ADD VALUE IF NOT EXISTS 'RENEW_QUANTITY';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "ContractAmendmentItemAction" ADD VALUE IF NOT EXISTS 'CLOSE_ITEM';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ContractFileDocumentType" AS ENUM (
    'CONTRATO', 'TERMO_REFERENCIA', 'ETP', 'EDITAL', 'PROPOSTA', 'ATA', 'PARECER',
    'ADITIVO', 'APOSTILAMENTO', 'NOTIFICACAO', 'OFICIO', 'RELATORIO', 'COMPROVANTE',
    'FISCALIZACAO', 'OUTROS'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ContractFileVisibility" AS ENUM ('INTERNAL_ONLY', 'AVAILABLE_TO_SUPPLIER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ContractFileStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REPLACED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "contract_file" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "documentType" "ContractFileDocumentType" NOT NULL DEFAULT 'OUTROS',
  "title" TEXT NOT NULL,
  "documentDate" DATE NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "fileSize" INTEGER,
  "referenceCode" TEXT,
  "notes" TEXT,
  "visibility" "ContractFileVisibility" NOT NULL DEFAULT 'INTERNAL_ONLY',
  "status" "ContractFileStatus" NOT NULL DEFAULT 'ACTIVE',
  "uploadedById" TEXT,
  "uploadedByLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "replacedById" TEXT,
  "replaceReason" TEXT,
  CONSTRAINT "contract_file_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contract_file_contractId_status_documentDate_idx"
  ON "contract_file"("contractId", "status", "documentDate");
CREATE INDEX IF NOT EXISTS "contract_file_contractId_documentType_idx"
  ON "contract_file"("contractId", "documentType");

DO $$ BEGIN
  ALTER TABLE "contract_file"
    ADD CONSTRAINT "contract_file_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
