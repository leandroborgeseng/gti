-- Classificação contratual local de chamados GLPI.

CREATE TYPE "ContractGlpiTicketCategory" AS ENUM (
  'CORRETIVO',
  'EVOLUTIVO',
  'SUPORTE',
  'DESENVOLVIMENTO',
  'DUVIDA',
  'INDISPONIBILIDADE',
  'OUTRO'
);

CREATE TABLE "contract_glpi_ticket_class" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "glpi_ticket_id" INTEGER NOT NULL,
    "category" "ContractGlpiTicketCategory" NOT NULL DEFAULT 'OUTRO',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_glpi_ticket_class_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_glpi_ticket_class_contract_id_glpi_ticket_id_key"
  ON "contract_glpi_ticket_class"("contract_id", "glpi_ticket_id");

CREATE INDEX "contract_glpi_ticket_class_contract_id_idx"
  ON "contract_glpi_ticket_class"("contract_id");

ALTER TABLE "contract_glpi_ticket_class"
  ADD CONSTRAINT "contract_glpi_ticket_class_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
