-- Ticket 69: políticas de retenção de auditoria (descarte desligado por padrão).

CREATE TABLE "audit_retention_policy" (
    "id" TEXT NOT NULL,
    "category_key" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "retention_days" INTEGER NOT NULL,
    "min_retention_days" INTEGER NOT NULL DEFAULT 90,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_retention_policy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "audit_retention_policy_category_key_key" ON "audit_retention_policy"("category_key");
CREATE INDEX "audit_retention_policy_active_category_key_idx" ON "audit_retention_policy"("active", "category_key");

CREATE TABLE "audit_retention_run" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "categories" JSONB NOT NULL,
    "deleted_count" INTEGER NOT NULL DEFAULT 0,
    "preview_count" INTEGER NOT NULL DEFAULT 0,
    "period_from" TIMESTAMP(3),
    "period_to" TIMESTAMP(3),
    "actor_user_id" TEXT,
    "summary" JSONB,
    "error_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_retention_run_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_retention_run_created_at_idx" ON "audit_retention_run"("created_at");

-- Políticas padrão (active=false). AUTH/SECURITY/PERMISSIONS com piso alto.
INSERT INTO "audit_retention_policy" ("id", "category_key", "label", "retention_days", "min_retention_days", "active", "sort_order", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'AUTH', 'Autenticação (login/logout)', 2555, 1825, false, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SECURITY', 'Segurança', 2555, 1825, false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PERMISSIONS', 'Permissões', 2555, 1825, false, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CONTRACTS', 'Contratos', 1825, 365, false, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MEASUREMENTS', 'Medições', 1825, 365, false, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GLOSAS', 'Glosas', 1825, 365, false, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ADMIN', 'Administração', 1095, 365, false, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'OTHER', 'Outros', 730, 90, false, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
