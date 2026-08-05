-- Prazos e alertas materializados (tickets 49, 51 e 58).

CREATE TYPE "DeadlineOrigin" AS ENUM (
  'CONTRACT_END',
  'SCHEDULE_STEP',
  'OCCURRENCE',
  'MEASUREMENT_PENDING',
  'FEATURE_VALIDATION',
  'GLPI_SLA',
  'DOCUMENT',
  'OTHER'
);

CREATE TYPE "DeadlineStatus" AS ENUM (
  'FUTURE',
  'NEAR_DUE',
  'DUE_TODAY',
  'OVERDUE',
  'DONE_ON_TIME',
  'DONE_LATE',
  'SUSPENDED',
  'EXTENDED',
  'CANCELLED'
);

CREATE TYPE "DeadlineAttentionLevel" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TABLE "deadline" (
    "id" TEXT NOT NULL,
    "origin" "DeadlineOrigin" NOT NULL,
    "contract_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "responsible_user_id" TEXT,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" "DeadlineStatus" NOT NULL DEFAULT 'FUTURE',
    "attention_level" "DeadlineAttentionLevel" NOT NULL DEFAULT 'LOW',
    "expected_action" TEXT,
    "source_entity_type" TEXT NOT NULL,
    "source_entity_id" TEXT NOT NULL,
    "sync_key" TEXT NOT NULL,
    "sync_managed" BOOLEAN NOT NULL DEFAULT true,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deadline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deadline_sync_key_key" ON "deadline"("sync_key");
CREATE INDEX "deadline_status_due_at_idx" ON "deadline"("status", "due_at");
CREATE INDEX "deadline_origin_status_idx" ON "deadline"("origin", "status");
CREATE INDEX "deadline_contract_id_idx" ON "deadline"("contract_id");
CREATE INDEX "deadline_responsible_user_id_idx" ON "deadline"("responsible_user_id");
CREATE INDEX "deadline_source_entity_type_source_entity_id_idx"
  ON "deadline"("source_entity_type", "source_entity_id");

ALTER TABLE "deadline"
  ADD CONSTRAINT "deadline_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "Contract"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deadline"
  ADD CONSTRAINT "deadline_responsible_user_id_fkey"
  FOREIGN KEY ("responsible_user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Permissões: visualizar prazos (todos os perfis de sistema) + recalcular (admin)
INSERT INTO "role_permission" ("id", "role", "profile_id", "permission_key", "granted", "updated_at")
SELECT
  'rp_' || md5(ap."system_key" || ':deadlines.view'),
  ap."system_key"::"UserRole",
  ap."id",
  'deadlines.view',
  true,
  CURRENT_TIMESTAMP
FROM "access_profile" ap
WHERE ap."system_key" IN ('ADMIN', 'EDITOR', 'VIEWER')
ON CONFLICT ("profile_id", "permission_key") DO NOTHING;

INSERT INTO "role_permission" ("id", "role", "profile_id", "permission_key", "granted", "updated_at")
SELECT
  'rp_' || md5('ADMIN:deadlines.recalculate'),
  'ADMIN'::"UserRole",
  ap."id",
  'deadlines.recalculate',
  true,
  CURRENT_TIMESTAMP
FROM "access_profile" ap
WHERE ap."system_key" = 'ADMIN'
ON CONFLICT ("profile_id", "permission_key") DO NOTHING;
