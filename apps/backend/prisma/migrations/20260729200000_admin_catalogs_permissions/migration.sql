-- Órgãos, permissões, tipos de contrato/contratação, identificação e valor global

-- Usuário: CPF e órgão
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cpf" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_cpf_key" ON "User"("cpf");
CREATE INDEX IF NOT EXISTS "User_organization_id_idx" ON "User"("organization_id");

-- Catálogo de órgãos
CREATE TABLE IF NOT EXISTS "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "acronym" TEXT NOT NULL,
    "code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "name_normalized" TEXT NOT NULL,
    "acronym_normalized" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_name_normalized_key" ON "organization"("name_normalized");
CREATE UNIQUE INDEX IF NOT EXISTS "organization_acronym_normalized_key" ON "organization"("acronym_normalized");

-- Tipos de contrato (catálogo)
CREATE TABLE IF NOT EXISTS "contract_type_catalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "acronym" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "legacy_enum" "ContractType",
    "name_normalized" TEXT NOT NULL,
    "acronym_normalized" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contract_type_catalog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "contract_type_catalog_name_normalized_key" ON "contract_type_catalog"("name_normalized");
CREATE UNIQUE INDEX IF NOT EXISTS "contract_type_catalog_acronym_normalized_key" ON "contract_type_catalog"("acronym_normalized");

-- Tipos de contratação
CREATE TABLE IF NOT EXISTS "hiring_type" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "name_normalized" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hiring_type_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "hiring_type_name_normalized_key" ON "hiring_type"("name_normalized");

CREATE TABLE IF NOT EXISTS "contract_internal_code_sequence" (
    "id" TEXT NOT NULL,
    "contract_type_catalog_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_sequential" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "contract_internal_code_sequence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "contract_internal_code_sequence_contract_type_catalog_id_year_key"
  ON "contract_internal_code_sequence"("contract_type_catalog_id", "year");

-- Permissões
CREATE TABLE IF NOT EXISTS "role_permission" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission_key" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "role_permission_role_permission_key_key" ON "role_permission"("role", "permission_key");
CREATE INDEX IF NOT EXISTS "role_permission_role_idx" ON "role_permission"("role");

CREATE TABLE IF NOT EXISTS "user_permission" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_permission_user_id_permission_key_key" ON "user_permission"("user_id", "permission_key");
CREATE INDEX IF NOT EXISTS "user_permission_user_id_idx" ON "user_permission"("user_id");

-- Extensão tipos de item
ALTER TABLE "contract_item_type" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "contract_item_type" ADD COLUMN IF NOT EXISTS "billing_kind" "ContractPricingBillingKind";
ALTER TABLE "contract_item_type" ADD COLUMN IF NOT EXISTS "suggested_unit_id" TEXT;
ALTER TABLE "contract_item_type" ADD COLUMN IF NOT EXISTS "participates_in_glosa" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contract_item_type" ADD COLUMN IF NOT EXISTS "use_in_measurements" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "contract_item_type" ADD COLUMN IF NOT EXISTS "use_in_balance_control" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contract_item_type" ADD COLUMN IF NOT EXISTS "use_in_consumption" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contract_item_type" ADD COLUMN IF NOT EXISTS "use_in_financial_planning" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contract_item_type" ADD COLUMN IF NOT EXISTS "info_only" BOOLEAN NOT NULL DEFAULT false;

-- Contrato: identificação, órgão, valor global
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "formal_number" TEXT;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "contract_year" INTEGER;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "internal_code" TEXT;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "administrative_process" TEXT;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "organization_pending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "contract_type_catalog_id" TEXT;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "hiring_type_id" TEXT;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "hiring_procedure_number" TEXT;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "global_value_original" DECIMAL(18,2);
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "global_value_current" DECIMAL(18,2);
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "global_value_manual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "global_value_justification" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Contract_internal_code_key" ON "Contract"("internal_code");
CREATE INDEX IF NOT EXISTS "Contract_organization_id_idx" ON "Contract"("organization_id");
CREATE INDEX IF NOT EXISTS "Contract_formal_number_contract_year_idx" ON "Contract"("formal_number", "contract_year");
CREATE INDEX IF NOT EXISTS "Contract_internal_code_idx" ON "Contract"("internal_code");

ALTER TABLE "MeasurementItem" ADD COLUMN IF NOT EXISTS "pricing_item_id" TEXT;
CREATE INDEX IF NOT EXISTS "MeasurementItem_pricing_item_id_idx" ON "MeasurementItem"("pricing_item_id");

-- FKs
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Contract" ADD CONSTRAINT "Contract_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Contract" ADD CONSTRAINT "Contract_contract_type_catalog_id_fkey"
    FOREIGN KEY ("contract_type_catalog_id") REFERENCES "contract_type_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Contract" ADD CONSTRAINT "Contract_hiring_type_id_fkey"
    FOREIGN KEY ("hiring_type_id") REFERENCES "hiring_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contract_internal_code_sequence" ADD CONSTRAINT "contract_internal_code_sequence_contract_type_catalog_id_fkey"
    FOREIGN KEY ("contract_type_catalog_id") REFERENCES "contract_type_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user_permission" ADD CONSTRAINT "user_permission_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contract_item_type" ADD CONSTRAINT "contract_item_type_suggested_unit_id_fkey"
    FOREIGN KEY ("suggested_unit_id") REFERENCES "measure_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MeasurementItem" ADD CONSTRAINT "MeasurementItem_pricing_item_id_fkey"
    FOREIGN KEY ("pricing_item_id") REFERENCES "contract_pricing_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seeds: tipos de contrato
INSERT INTO "contract_type_catalog" ("id", "name", "acronym", "description", "active", "legacy_enum", "name_normalized", "acronym_normalized", "sort_order", "updated_at") VALUES
  ('ctc_software', 'Software', 'ST', 'Sistemas e soluções de software', true, 'SOFTWARE', 'software', 'ST', 10, CURRENT_TIMESTAMP),
  ('ctc_datacenter', 'Datacenter', 'DC', 'Serviços de datacenter', true, 'DATACENTER', 'datacenter', 'DC', 20, CURRENT_TIMESTAMP),
  ('ctc_infra', 'Infraestrutura', 'IF', 'Infraestrutura de TI', true, 'INFRA', 'infraestrutura', 'IF', 30, CURRENT_TIMESTAMP),
  ('ctc_servico', 'Serviço', 'SV', 'Serviços de TI em geral', true, 'SERVICO', 'servico', 'SV', 40, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Seeds: tipos de contratação
INSERT INTO "hiring_type" ("id", "name", "description", "active", "name_normalized", "sort_order", "updated_at") VALUES
  ('ht_pregao_eletronico', 'Pregão Eletrônico', NULL, true, 'pregao eletronico', 10, CURRENT_TIMESTAMP),
  ('ht_pregao_presencial', 'Pregão Presencial', NULL, true, 'pregao presencial', 20, CURRENT_TIMESTAMP),
  ('ht_concorrencia', 'Concorrência', NULL, true, 'concorrencia', 30, CURRENT_TIMESTAMP),
  ('ht_dispensa', 'Dispensa de Licitação', NULL, true, 'dispensa de licitacao', 40, CURRENT_TIMESTAMP),
  ('ht_inexigibilidade', 'Inexigibilidade', NULL, true, 'inexigibilidade', 50, CURRENT_TIMESTAMP),
  ('ht_adesao_arp', 'Adesão a Ata de Registro de Preços', NULL, true, 'adesao a ata de registro de precos', 60, CURRENT_TIMESTAMP),
  ('ht_credenciamento', 'Credenciamento', NULL, true, 'credenciamento', 70, CURRENT_TIMESTAMP),
  ('ht_chamamento', 'Chamamento Público', NULL, true, 'chamamento publico', 80, CURRENT_TIMESTAMP),
  ('ht_outra', 'Outra forma de contratação', NULL, true, 'outra forma de contratacao', 999, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Atualiza tipos de item (glosa / natureza)
UPDATE "contract_item_type" SET
  "billing_kind" = 'RECURRING',
  "participates_in_glosa" = true,
  "suggested_unit_id" = 'mu_mes',
  "use_in_measurements" = true,
  "use_in_financial_planning" = true,
  "description" = 'Mensalidade recorrente do contrato'
WHERE "code" = 'MENSALIDADE';

UPDATE "contract_item_type" SET
  "billing_kind" = 'ONE_TIME',
  "suggested_unit_id" = 'mu_servico',
  "use_in_measurements" = true,
  "description" = 'Implantação ou projeto de valor único'
WHERE "code" = 'IMPLANTACAO';

UPDATE "contract_item_type" SET
  "billing_kind" = 'ON_DEMAND',
  "suggested_unit_id" = 'mu_hora',
  "use_in_measurements" = true,
  "use_in_balance_control" = true,
  "use_in_consumption" = true
WHERE "code" IN ('HORAS_DESENVOLVIMENTO', 'HORAS_SUPORTE', 'UST');

-- Backfill identificação a partir do número atual (ex.: 370/2022)
UPDATE "Contract" SET
  "formal_number" = CASE
    WHEN "number" ~ '/[0-9]{4}$' THEN split_part("number", '/', 1)
    ELSE regexp_replace("number", '\D', '', 'g')
  END,
  "contract_year" = CASE
    WHEN "number" ~ '/[0-9]{4}$' THEN NULLIF(split_part("number", '/', 2), '')::INTEGER
    ELSE EXTRACT(YEAR FROM "startDate")::INTEGER
  END
WHERE "formal_number" IS NULL;

UPDATE "Contract" c SET
  "contract_type_catalog_id" = t."id"
FROM "contract_type_catalog" t
WHERE t."legacy_enum" = c."contractType"
  AND c."contract_type_catalog_id" IS NULL;

-- Valor global inicial a partir dos campos atuais
UPDATE "Contract" SET
  "global_value_original" = COALESCE("totalValue", "monthlyValue" * 12 + COALESCE("installationValue", 0)),
  "global_value_current" = COALESCE("totalValue", "monthlyValue" * 12 + COALESCE("installationValue", 0))
WHERE "global_value_current" IS NULL;

-- Órgãos a partir de managingUnit distintos
INSERT INTO "organization" ("id", "name", "acronym", "active", "name_normalized", "acronym_normalized", "updated_at")
SELECT
  'org_' || md5(lower(trim(mu))),
  trim(mu),
  UPPER(LEFT(regexp_replace(trim(mu), '[^A-Za-z0-9]', '', 'g'), 8)),
  true,
  lower(trim(regexp_replace(trim(mu), '\s+', ' ', 'g'))),
  lower(LEFT(regexp_replace(trim(mu), '[^A-Za-z0-9]', '', 'g'), 8)),
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "managingUnit" AS mu FROM "Contract"
  WHERE "managingUnit" IS NOT NULL AND trim("managingUnit") <> ''
) s
ON CONFLICT ("name_normalized") DO NOTHING;

UPDATE "Contract" c SET
  "organization_id" = o."id",
  "organization_pending" = false
FROM "organization" o
WHERE c."managingUnit" IS NOT NULL
  AND lower(trim(regexp_replace(trim(c."managingUnit"), '\s+', ' ', 'g'))) = o."name_normalized"
  AND c."organization_id" IS NULL;

UPDATE "Contract" SET "organization_pending" = true
WHERE "managingUnit" IS NOT NULL AND trim("managingUnit") <> '' AND "organization_id" IS NULL;

-- Permissões iniciais (compatível com papéis atuais)
INSERT INTO "role_permission" ("id", "role", "permission_key", "granted", "updated_at")
SELECT 'rp_' || md5(r.role::text || ':' || p.key), r.role, p.key, true, CURRENT_TIMESTAMP
FROM (VALUES ('ADMIN'::"UserRole"), ('EDITOR'::"UserRole"), ('VIEWER'::"UserRole")) AS r(role)
CROSS JOIN (VALUES
  ('dashboard.view'),
  ('contracts.view'),
  ('contracts.features.view'),
  ('measurements.view'),
  ('glosas.view'),
  ('governance.view'),
  ('goals.view'),
  ('projects.view'),
  ('suppliers.view'),
  ('fiscais.view'),
  ('reports.view'),
  ('manual.view')
) AS p(key)
ON CONFLICT ("role", "permission_key") DO NOTHING;

INSERT INTO "role_permission" ("id", "role", "permission_key", "granted", "updated_at")
SELECT 'rp_' || md5(r.role::text || ':' || p.key), r.role, p.key, true, CURRENT_TIMESTAMP
FROM (VALUES ('ADMIN'::"UserRole"), ('EDITOR'::"UserRole")) AS r(role)
CROSS JOIN (VALUES
  ('contracts.create'),
  ('contracts.edit'),
  ('contracts.features.edit_delivery'),
  ('contracts.features.edit_criticality'),
  ('measurements.create'),
  ('measurements.edit'),
  ('glosas.create'),
  ('exports.run'),
  ('projects.edit')
) AS p(key)
ON CONFLICT ("role", "permission_key") DO NOTHING;

INSERT INTO "role_permission" ("id", "role", "permission_key", "granted", "updated_at")
SELECT 'rp_' || md5('ADMIN:' || p.key), 'ADMIN'::"UserRole", p.key, true, CURRENT_TIMESTAMP
FROM (VALUES
  ('contracts.delete'),
  ('contracts.financial.view'),
  ('admin.users.view'),
  ('admin.users.manage'),
  ('admin.organs.view'),
  ('admin.organs.manage'),
  ('admin.permissions.view'),
  ('admin.permissions.manage'),
  ('admin.item_types.view'),
  ('admin.item_types.manage'),
  ('admin.contract_types.view'),
  ('admin.contract_types.manage'),
  ('admin.hiring_types.view'),
  ('admin.hiring_types.manage'),
  ('admin.backup.manage')
) AS p(key)
ON CONFLICT ("role", "permission_key") DO NOTHING;
