-- Ocorrências contratuais e encaminhamento à Controladoria (tickets 47 e 48).
-- Sem notificação automática; evidências em texto (anexos em onda futura).

CREATE TYPE "ContractOccurrenceType" AS ENUM (
  'DESCUMPRIMENTO_SLA',
  'ATRASO_ENTREGA',
  'FALHA_QUALIDADE',
  'INCIDENTE_OPERACIONAL',
  'NAO_CONFORMIDADE',
  'RECLAMACAO',
  'AUDITORIA',
  'OUTRO'
);

CREATE TYPE "ContractOccurrenceOrigin" AS ENUM (
  'FISCALIZACAO',
  'MEDICAO',
  'CHAMADO_GLPI',
  'EMPRESA',
  'AUDITORIA_INTERNA',
  'DENUNCIA',
  'CONTROLADORIA',
  'OUTRO'
);

CREATE TYPE "ContractOccurrenceSeverity" AS ENUM (
  'BAIXA',
  'MEDIA',
  'ALTA',
  'CRITICA'
);

CREATE TYPE "ContractOccurrenceStatus" AS ENUM (
  'EM_ANALISE',
  'AGUARDANDO_PROVIDENCIA_INTERNA',
  'AGUARDANDO_EMPRESA',
  'EM_REGULARIZACAO',
  'REGULARIZADA',
  'NAO_REGULARIZADA',
  'REINCIDENTE',
  'ENCAMINHADA_CONTROLADORIA',
  'EM_PROCESSO_ADMINISTRATIVO',
  'CONCLUIDA',
  'ARQUIVADA'
);

CREATE TYPE "ContractControladoriaCaseStatus" AS ENUM (
  'EM_PREPARACAO',
  'ENCAMINHADO',
  'RECEBIDO_CONTROLADORIA',
  'COMPLEMENTACAO_SOLICITADA',
  'EM_INSTRUCAO',
  'AGUARDANDO_DEFESA',
  'EM_ANALISE',
  'AGUARDANDO_DECISAO',
  'EM_RECURSO',
  'CONCLUIDO',
  'ARQUIVADO'
);

CREATE TABLE "contract_occurrence" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "type" "ContractOccurrenceType" NOT NULL,
    "origin" "ContractOccurrenceOrigin" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "detection_date" TIMESTAMP(3) NOT NULL,
    "linked_pricing_item_ids" JSONB,
    "linked_feature_ids" JSONB,
    "linked_measurement_ids" JSONB,
    "linked_glosa_ids" JSONB,
    "linked_schedule_ids" JSONB,
    "severity" "ContractOccurrenceSeverity" NOT NULL DEFAULT 'MEDIA',
    "internal_responsible_user_id" TEXT,
    "regularization_deadline" TIMESTAMP(3),
    "status" "ContractOccurrenceStatus" NOT NULL DEFAULT 'EM_ANALISE',
    "conclusion" TEXT,
    "evidence_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_occurrence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contract_occurrence_event" (
    "id" TEXT NOT NULL,
    "occurrence_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "from_status" "ContractOccurrenceStatus",
    "to_status" "ContractOccurrenceStatus",
    "justification" TEXT,
    "actor_id" TEXT,
    "actor_label" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_occurrence_event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contract_controladoria_case" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "occurrence_id" TEXT NOT NULL,
    "status" "ContractControladoriaCaseStatus" NOT NULL DEFAULT 'EM_PREPARACAO',
    "justification" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "suggested_actions" TEXT,
    "snapshot_json" JSONB NOT NULL,
    "process_number" TEXT,
    "origin_system" TEXT,
    "process_link" TEXT,
    "opened_at" TIMESTAMP(3),
    "subject" TEXT,
    "unit" TEXT,
    "responsibles_text" TEXT,
    "phase" TEXT,
    "deadlines_text" TEXT,
    "decisions_text" TEXT,
    "penalties_text" TEXT,
    "result_text" TEXT,
    "sei_number" TEXT,
    "sei_link" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_controladoria_case_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contract_occurrence_contract_id_status_idx" ON "contract_occurrence"("contract_id", "status");
CREATE INDEX "contract_occurrence_contract_id_detection_date_idx" ON "contract_occurrence"("contract_id", "detection_date");
CREATE INDEX "contract_occurrence_internal_responsible_user_id_idx" ON "contract_occurrence"("internal_responsible_user_id");
CREATE INDEX "contract_occurrence_event_occurrence_id_created_at_idx" ON "contract_occurrence_event"("occurrence_id", "created_at");
CREATE INDEX "contract_controladoria_case_contract_id_status_idx" ON "contract_controladoria_case"("contract_id", "status");
CREATE INDEX "contract_controladoria_case_occurrence_id_idx" ON "contract_controladoria_case"("occurrence_id");
CREATE INDEX "contract_controladoria_case_status_created_at_idx" ON "contract_controladoria_case"("status", "created_at");

ALTER TABLE "contract_occurrence"
ADD CONSTRAINT "contract_occurrence_contract_id_fkey"
FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_occurrence"
ADD CONSTRAINT "contract_occurrence_internal_responsible_user_id_fkey"
FOREIGN KEY ("internal_responsible_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_occurrence_event"
ADD CONSTRAINT "contract_occurrence_event_occurrence_id_fkey"
FOREIGN KEY ("occurrence_id") REFERENCES "contract_occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_controladoria_case"
ADD CONSTRAINT "contract_controladoria_case_contract_id_fkey"
FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_controladoria_case"
ADD CONSTRAINT "contract_controladoria_case_occurrence_id_fkey"
FOREIGN KEY ("occurrence_id") REFERENCES "contract_occurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permissão de gestão Controladoria (perfil Administrador)
INSERT INTO "role_permission" ("id", "role", "profile_id", "permission_key", "granted", "updated_at")
SELECT
  'rp_' || md5('ADMIN:controladoria.manage'),
  'ADMIN'::"UserRole",
  ap."id",
  'controladoria.manage',
  true,
  CURRENT_TIMESTAMP
FROM "access_profile" ap
WHERE ap."system_key" = 'ADMIN'
ON CONFLICT ("profile_id", "permission_key") DO NOTHING;

-- Eventos de auditoria (ocorrências e Controladoria)
INSERT INTO "audit_event_config" (
  "id", "module_key", "screen_key", "action_key", "label", "module_label",
  "enabled", "detail_level", "mandatory", "sort_order", "created_at", "updated_at"
) VALUES
  ('aec_occ_create_47a1b2c3d4e5', 'contracts', 'occurrence', 'CREATE', 'Criar ocorrência', 'Contratos', true, 'ACTION_AND_VALUES', false, 120, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_occ_update_47a1b2c3d4e5', 'contracts', 'occurrence', 'UPDATE', 'Editar ocorrência', 'Contratos', true, 'ACTION_AND_VALUES', false, 130, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_occ_delete_47a1b2c3d4e5', 'contracts', 'occurrence', 'DELETE', 'Excluir ocorrência', 'Contratos', true, 'ACTION_AND_VALUES', false, 140, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_occ_status_47a1b2c3d4e5', 'contracts', 'occurrence', 'STATUS_CHANGE', 'Alterar situação da ocorrência', 'Contratos', true, 'ACTION_AND_VALUES', false, 150, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_ctrl_create_48a1b2c3d4e5', 'contracts', 'controladoria', 'CREATE', 'Encaminhar à Controladoria', 'Contratos', true, 'ACTION_AND_VALUES', false, 160, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_ctrl_update_48a1b2c3d4e5', 'contracts', 'controladoria', 'UPDATE', 'Atualizar caso Controladoria', 'Contratos', true, 'ACTION_AND_VALUES', false, 170, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("module_key", "screen_key", "action_key") DO NOTHING;
