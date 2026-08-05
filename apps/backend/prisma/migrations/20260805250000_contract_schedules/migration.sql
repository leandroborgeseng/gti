-- Cronogramas e marcos operacionais do contrato (ticket 40).
-- Independente de notificações; anexos ficam para onda futura.

CREATE TYPE "ContractScheduleType" AS ENUM (
  'IMPLANTACAO',
  'MIGRACAO',
  'TREINAMENTO',
  'ENTREGA_EQUIPAMENTOS',
  'INSTALACAO',
  'INTEGRACAO',
  'DESENVOLVIMENTO',
  'TRANSICAO',
  'OPERACAO_ASSISTIDA',
  'PLANO_ACAO',
  'CORRECAO_PENDENCIAS',
  'ENCERRAMENTO',
  'OUTRO'
);

CREATE TYPE "ContractScheduleOrigin" AS ENUM (
  'TERMO_REFERENCIA',
  'PROPOSTA_EMPRESA',
  'PLANEJAMENTO_INICIAL',
  'REUNIAO',
  'ADITIVO',
  'NOTIFICACAO',
  'PLANO_ACAO',
  'DETERMINACAO_ADMIN',
  'OUTRO'
);

CREATE TYPE "ContractScheduleStatus" AS ENUM (
  'RASCUNHO',
  'ENVIADO_ANALISE',
  'AJUSTES_SOLICITADOS',
  'APROVADO',
  'EM_EXECUCAO',
  'SUSPENSO',
  'CONCLUIDO',
  'CANCELADO',
  'SUBSTITUIDO'
);

CREATE TYPE "ContractScheduleMilestoneStatus" AS ENUM (
  'NAO_INICIADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'ATRASADA',
  'BLOQUEADA',
  'CANCELADA'
);

CREATE TABLE "contract_schedule" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ContractScheduleType" NOT NULL,
    "purpose" TEXT,
    "origin" "ContractScheduleOrigin" NOT NULL DEFAULT 'OUTRO',
    "description" TEXT,
    "planned_start_date" TIMESTAMP(3),
    "planned_end_date" TIMESTAMP(3),
    "company_responsibles" TEXT,
    "status" "ContractScheduleStatus" NOT NULL DEFAULT 'RASCUNHO',
    "version" INTEGER NOT NULL DEFAULT 1,
    "lineage_id" TEXT NOT NULL,
    "replaced_by_id" TEXT,
    "impacta_financeiro" BOOLEAN NOT NULL DEFAULT false,
    "pricing_item_id" TEXT,
    "observations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_schedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contract_schedule_internal_responsible" (
    "schedule_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_schedule_internal_responsible_pkey" PRIMARY KEY ("schedule_id","user_id")
);

CREATE TABLE "contract_schedule_milestone" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "activity" TEXT NOT NULL,
    "description" TEXT,
    "pricing_item_id" TEXT,
    "feature_id" TEXT,
    "planned_start_date" TIMESTAMP(3),
    "planned_end_date" TIMESTAMP(3),
    "actual_start_date" TIMESTAMP(3),
    "actual_end_date" TIMESTAMP(3),
    "percent_complete" DECIMAL(5,2),
    "status" "ContractScheduleMilestoneStatus" NOT NULL DEFAULT 'NAO_INICIADA',
    "dependencies" TEXT,
    "observations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_schedule_milestone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contract_schedule_milestone_internal_responsible" (
    "milestone_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_schedule_milestone_internal_responsible_pkey" PRIMARY KEY ("milestone_id","user_id")
);

CREATE INDEX "contract_schedule_contract_id_status_idx" ON "contract_schedule"("contract_id", "status");
CREATE INDEX "contract_schedule_contract_id_lineage_id_version_idx" ON "contract_schedule"("contract_id", "lineage_id", "version");
CREATE INDEX "contract_schedule_pricing_item_id_idx" ON "contract_schedule"("pricing_item_id");
CREATE INDEX "contract_schedule_internal_responsible_user_id_idx" ON "contract_schedule_internal_responsible"("user_id");
CREATE INDEX "contract_schedule_milestone_schedule_id_sequence_idx" ON "contract_schedule_milestone"("schedule_id", "sequence");
CREATE INDEX "contract_schedule_milestone_pricing_item_id_idx" ON "contract_schedule_milestone"("pricing_item_id");
CREATE INDEX "contract_schedule_milestone_feature_id_idx" ON "contract_schedule_milestone"("feature_id");
CREATE INDEX "contract_schedule_milestone_internal_responsible_user_id_idx" ON "contract_schedule_milestone_internal_responsible"("user_id");

ALTER TABLE "contract_schedule"
ADD CONSTRAINT "contract_schedule_contract_id_fkey"
FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_schedule"
ADD CONSTRAINT "contract_schedule_pricing_item_id_fkey"
FOREIGN KEY ("pricing_item_id") REFERENCES "contract_pricing_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_schedule"
ADD CONSTRAINT "contract_schedule_replaced_by_id_fkey"
FOREIGN KEY ("replaced_by_id") REFERENCES "contract_schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_schedule_internal_responsible"
ADD CONSTRAINT "contract_schedule_internal_responsible_schedule_id_fkey"
FOREIGN KEY ("schedule_id") REFERENCES "contract_schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_schedule_internal_responsible"
ADD CONSTRAINT "contract_schedule_internal_responsible_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_schedule_milestone"
ADD CONSTRAINT "contract_schedule_milestone_schedule_id_fkey"
FOREIGN KEY ("schedule_id") REFERENCES "contract_schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_schedule_milestone"
ADD CONSTRAINT "contract_schedule_milestone_pricing_item_id_fkey"
FOREIGN KEY ("pricing_item_id") REFERENCES "contract_pricing_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_schedule_milestone"
ADD CONSTRAINT "contract_schedule_milestone_feature_id_fkey"
FOREIGN KEY ("feature_id") REFERENCES "ContractFeature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_schedule_milestone_internal_responsible"
ADD CONSTRAINT "contract_schedule_milestone_internal_responsible_milestone_id_fkey"
FOREIGN KEY ("milestone_id") REFERENCES "contract_schedule_milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_schedule_milestone_internal_responsible"
ADD CONSTRAINT "contract_schedule_milestone_internal_responsible_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
