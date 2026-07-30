-- Itens contratuais dinâmicos (precificação) + catálogos de tipo e unidade

CREATE TYPE "ContractPricingBillingKind" AS ENUM ('RECURRING', 'ONE_TIME', 'ON_DEMAND');
CREATE TYPE "ContractPricingPeriodicity" AS ENUM ('MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM');
CREATE TYPE "ContractPricingItemStatus" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE "contract_item_type" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contract_item_type_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_item_type_code_key" ON "contract_item_type"("code");

CREATE TABLE "measure_unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "measure_unit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "measure_unit_code_key" ON "measure_unit"("code");

CREATE TABLE "contract_pricing_item" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_value" DECIMAL(18,4) NOT NULL,
    "total_value" DECIMAL(18,2) NOT NULL,
    "total_manual" BOOLEAN NOT NULL DEFAULT false,
    "total_justification" TEXT,
    "billing_kind" "ContractPricingBillingKind" NOT NULL,
    "periodicity" "ContractPricingPeriodicity",
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "status" "ContractPricingItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "consumed_quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contract_pricing_item_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_pricing_item_contract_id_sequence_key" ON "contract_pricing_item"("contract_id", "sequence");
CREATE INDEX "contract_pricing_item_contract_id_status_idx" ON "contract_pricing_item"("contract_id", "status");
CREATE INDEX "contract_pricing_item_type_id_idx" ON "contract_pricing_item"("type_id");

ALTER TABLE "contract_pricing_item" ADD CONSTRAINT "contract_pricing_item_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_pricing_item" ADD CONSTRAINT "contract_pricing_item_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "contract_item_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contract_pricing_item" ADD CONSTRAINT "contract_pricing_item_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "measure_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Catálogo inicial de tipos
INSERT INTO "contract_item_type" ("id", "code", "label", "active", "sort_order", "updated_at") VALUES
  ('cit_mensalidade', 'MENSALIDADE', 'Mensalidade', true, 10, CURRENT_TIMESTAMP),
  ('cit_implantacao', 'IMPLANTACAO', 'Implantação', true, 20, CURRENT_TIMESTAMP),
  ('cit_horas_dev', 'HORAS_DESENVOLVIMENTO', 'Horas de desenvolvimento', true, 30, CURRENT_TIMESTAMP),
  ('cit_horas_suporte', 'HORAS_SUPORTE', 'Horas de suporte', true, 40, CURRENT_TIMESTAMP),
  ('cit_treinamento', 'TREINAMENTO', 'Treinamentos', true, 50, CURRENT_TIMESTAMP),
  ('cit_ust', 'UST', 'UST', true, 60, CURRENT_TIMESTAMP),
  ('cit_equipamento', 'EQUIPAMENTO', 'Equipamentos', true, 70, CURRENT_TIMESTAMP),
  ('cit_licenca', 'LICENCA', 'Licenças', true, 80, CURRENT_TIMESTAMP),
  ('cit_locacao', 'LOCACAO', 'Locações', true, 90, CURRENT_TIMESTAMP),
  ('cit_infra', 'SERVICO_INFRA', 'Serviços de infraestrutura', true, 100, CURRENT_TIMESTAMP),
  ('cit_material', 'MATERIAL', 'Materiais', true, 110, CURRENT_TIMESTAMP),
  ('cit_outro', 'OUTRO', 'Outro', true, 999, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Catálogo inicial de unidades
INSERT INTO "measure_unit" ("id", "code", "label", "active", "sort_order", "updated_at") VALUES
  ('mu_mes', 'MES', 'Mês', true, 10, CURRENT_TIMESTAMP),
  ('mu_hora', 'HORA', 'Hora', true, 20, CURRENT_TIMESTAMP),
  ('mu_unidade', 'UNIDADE', 'Unidade', true, 30, CURRENT_TIMESTAMP),
  ('mu_servico', 'SERVICO', 'Serviço', true, 40, CURRENT_TIMESTAMP),
  ('mu_ust', 'UST', 'UST', true, 50, CURRENT_TIMESTAMP),
  ('mu_licenca', 'LICENCA', 'Licença', true, 60, CURRENT_TIMESTAMP),
  ('mu_usuario', 'USUARIO', 'Usuário', true, 70, CURRENT_TIMESTAMP),
  ('mu_equipamento', 'EQUIPAMENTO', 'Equipamento', true, 80, CURRENT_TIMESTAMP),
  ('mu_diaria', 'DIARIA', 'Diária', true, 90, CURRENT_TIMESTAMP),
  ('mu_visita', 'VISITA', 'Visita', true, 100, CURRENT_TIMESTAMP),
  ('mu_pacote', 'PACOTE', 'Pacote', true, 110, CURRENT_TIMESTAMP),
  ('mu_lote', 'LOTE', 'Lote', true, 120, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Backfill: mensalidade → item recorrente
INSERT INTO "contract_pricing_item" (
  "id", "contract_id", "sequence", "type_id", "description", "unit_id",
  "quantity", "unit_value", "total_value", "total_manual", "billing_kind", "periodicity",
  "period_start", "period_end", "status", "consumed_quantity", "updated_at"
)
SELECT
  'cpi_m_' || c."id",
  c."id",
  1,
  'cit_mensalidade',
  'Mensalidade migrada do cadastro anterior do contrato',
  'mu_mes',
  GREATEST(1, ROUND(EXTRACT(EPOCH FROM (c."endDate" - c."startDate")) / (30.4375 * 86400))),
  c."monthlyValue",
  ROUND(c."monthlyValue" * GREATEST(1, ROUND(EXTRACT(EPOCH FROM (c."endDate" - c."startDate")) / (30.4375 * 86400))), 2),
  false,
  'RECURRING',
  'MONTHLY',
  c."startDate",
  c."endDate",
  'ACTIVE',
  0,
  CURRENT_TIMESTAMP
FROM "Contract" c
WHERE c."deletedAt" IS NULL
  AND c."monthlyValue" > 0
  AND NOT EXISTS (SELECT 1 FROM "contract_pricing_item" p WHERE p."contract_id" = c."id");

-- Backfill: implantação → item único
INSERT INTO "contract_pricing_item" (
  "id", "contract_id", "sequence", "type_id", "description", "unit_id",
  "quantity", "unit_value", "total_value", "total_manual", "billing_kind", "periodicity",
  "period_start", "period_end", "status", "consumed_quantity", "updated_at"
)
SELECT
  'cpi_i_' || c."id",
  c."id",
  COALESCE((SELECT MAX(p."sequence") FROM "contract_pricing_item" p WHERE p."contract_id" = c."id"), 0) + 1,
  'cit_implantacao',
  'Implantação migrada do cadastro anterior do contrato',
  'mu_servico',
  1,
  c."installationValue",
  c."installationValue",
  false,
  'ONE_TIME',
  NULL,
  c."implementationPeriodStart",
  c."implementationPeriodEnd",
  'ACTIVE',
  0,
  CURRENT_TIMESTAMP
FROM "Contract" c
WHERE c."deletedAt" IS NULL
  AND c."installationValue" IS NOT NULL
  AND c."installationValue" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "contract_pricing_item" p
    WHERE p."contract_id" = c."id" AND p."type_id" = 'cit_implantacao'
  );
