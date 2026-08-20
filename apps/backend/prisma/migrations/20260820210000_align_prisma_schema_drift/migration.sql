-- Alinha o banco ao schema Prisma (drift acumulado: índice ausente, nomes truncados pelo limite de 63 chars do Postgres, defaults).

-- Índice previsto no schema e omitido na migration de consumo.
CREATE INDEX IF NOT EXISTS "contract_pricing_item_contract_id_consumption_enabled_idx"
  ON "contract_pricing_item"("contract_id", "consumption_enabled");

-- Renomeia identificadores truncados para os nomes canônicos esperados pelo Prisma.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND c.relname = 'contract_consumption_movement_pricing_item_id_activity_status_i'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND c.relname = 'contract_consumption_movement_pricing_item_id_activity_stat_idx'
  ) THEN
    ALTER INDEX "contract_consumption_movement_pricing_item_id_activity_status_i"
      RENAME TO "contract_consumption_movement_pricing_item_id_activity_stat_idx";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND c.relname = 'contract_internal_code_sequence_contract_type_catalog_id_year_k'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND c.relname = 'contract_internal_code_sequence_contract_type_catalog_id_ye_key'
  ) THEN
    ALTER INDEX "contract_internal_code_sequence_contract_type_catalog_id_year_k"
      RENAME TO "contract_internal_code_sequence_contract_type_catalog_id_ye_key";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contract_schedule_milestone_internal_responsible_milestone_id_f'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contract_schedule_milestone_internal_responsible_milestone_fkey'
  ) THEN
    ALTER TABLE "contract_schedule_milestone_internal_responsible"
      RENAME CONSTRAINT "contract_schedule_milestone_internal_responsible_milestone_id_f"
      TO "contract_schedule_milestone_internal_responsible_milestone_fkey";
  END IF;
END $$;

-- @updatedAt no schema não usa DEFAULT no banco.
ALTER TABLE "SyncState" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Ticket" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "TicketAttribute" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "audit_retention_policy" ALTER COLUMN "updated_at" DROP DEFAULT;

-- @id @default("default") no schema.
ALTER TABLE "email_outbound_config" ALTER COLUMN "id" SET DEFAULT 'default';
ALTER TABLE "s3_backup_config" ALTER COLUMN "id" SET DEFAULT 'default';
