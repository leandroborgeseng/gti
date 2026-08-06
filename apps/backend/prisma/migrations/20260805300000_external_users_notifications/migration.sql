-- Usuários externos + modelos/notificações/assinatura/envio (tickets 39, 41–46).

-- Enums
CREATE TYPE "UserKind" AS ENUM ('INTERNAL', 'EXTERNAL');
CREATE TYPE "ExternalUserFunction" AS ENUM ('REPRESENTANTE_LEGAL', 'RESPONSAVEL_CONTRATUAL', 'RESPONSAVEL_TECNICO', 'USUARIO_AUXILIAR');
CREATE TYPE "NotificationSeverity" AS ENUM ('INFORMATIVA', 'ADVERTENCIA', 'URGENTE', 'CRITICA');
CREATE TYPE "NotificationPurpose" AS ENUM ('CIENCIA', 'PROVIDENCIA', 'MANIFESTACAO', 'PLANO_ACAO', 'CRONOGRAMA', 'OUTRO');
CREATE TYPE "NotificationType" AS ENUM ('COMUNICADO', 'NOTIFICACAO_FORMAL', 'ADVERTENCIA', 'SOLICITACAO_PROVIDENCIA', 'COBRANCA_PRAZO', 'OUTRO');
CREATE TYPE "ContractNotificationStatus" AS ENUM (
  'RASCUNHO', 'EM_ELABORACAO', 'EM_REVISAO', 'DEVOLVIDA_CORRECAO', 'APROVADA_ASSINATURA',
  'AGUARDANDO_ASSINATURA', 'ASSINADA', 'ENVIADA', 'RECEBIDA', 'AGUARDANDO_RESPOSTA',
  'RESPONDIDA', 'EM_ANALISE', 'ATENDIDA', 'NAO_ATENDIDA', 'ENCAMINHADA_CONTROLADORIA',
  'CANCELADA', 'RETIFICADA', 'ENCERRADA'
);
CREATE TYPE "NotificationSignModality" AS ENUM ('PASSWORD', 'CERTIFICATE_READY');
CREATE TYPE "NotificationManifestationAnalysis" AS ENUM ('ACEITA', 'PARCIAL', 'REJEITADA', 'PENDENTE', 'ATENDIDA');

-- User externo
ALTER TABLE "User" ADD COLUMN "user_kind" "UserKind" NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "User" ADD COLUMN "supplier_id" TEXT;
ALTER TABLE "User" ADD COLUMN "external_function" "ExternalUserFunction";

CREATE INDEX "User_user_kind_idx" ON "User"("user_kind");
CREATE INDEX "User_supplier_id_idx" ON "User"("supplier_id");

ALTER TABLE "User" ADD CONSTRAINT "User_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Supplier" ADD COLUMN "contacts" JSONB;

-- Contratos autorizados (externo)
CREATE TABLE "user_external_contract" (
    "user_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_external_contract_pkey" PRIMARY KEY ("user_id","contract_id")
);
CREATE INDEX "user_external_contract_contract_id_idx" ON "user_external_contract"("contract_id");
ALTER TABLE "user_external_contract" ADD CONSTRAINT "user_external_contract_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_external_contract" ADD CONSTRAINT "user_external_contract_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Perfil EXTERNAL protegido
INSERT INTO "access_profile" ("id", "name", "description", "active", "name_normalized", "system_key", "protected", "created_at", "updated_at")
VALUES (
  '00000000-0000-4000-8000-0000000000x4',
  'Usuário externo',
  'Perfil de sistema para empresas contratadas (portal externo).',
  true,
  'usuario externo',
  'EXTERNAL',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Permissões do perfil EXTERNAL (+ novas chaves no catálogo ADMIN/EDITOR/VIEWER)
INSERT INTO "role_permission" ("id", "role", "profile_id", "permission_key", "granted", "updated_at")
SELECT gen_random_uuid()::text, 'VIEWER'::"UserRole", '00000000-0000-4000-8000-0000000000x4', k, true, CURRENT_TIMESTAMP
FROM (VALUES
  ('contracts.view'),
  ('notifications.view'),
  ('notifications.respond'),
  ('schedules.view'),
  ('documents.view'),
  ('profile.view')
) AS v(k)
ON CONFLICT ("profile_id", "permission_key") DO NOTHING;

INSERT INTO "role_permission" ("id", "role", "profile_id", "permission_key", "granted", "updated_at")
SELECT gen_random_uuid()::text, 'ADMIN'::"UserRole", '00000000-0000-4000-8000-0000000000a1', k, true, CURRENT_TIMESTAMP
FROM (VALUES
  ('notification_templates.manage'),
  ('notifications.view'),
  ('notifications.manage'),
  ('notifications.sign'),
  ('notifications.send'),
  ('notifications.analyze'),
  ('schedules.view'),
  ('documents.view'),
  ('profile.view')
) AS v(k)
ON CONFLICT ("profile_id", "permission_key") DO NOTHING;

INSERT INTO "role_permission" ("id", "role", "profile_id", "permission_key", "granted", "updated_at")
SELECT gen_random_uuid()::text, 'EDITOR'::"UserRole", '00000000-0000-4000-8000-0000000000e2', k, true, CURRENT_TIMESTAMP
FROM (VALUES
  ('notifications.view'),
  ('notifications.manage'),
  ('notifications.sign'),
  ('notifications.send'),
  ('notifications.analyze'),
  ('schedules.view'),
  ('documents.view'),
  ('profile.view')
) AS v(k)
ON CONFLICT ("profile_id", "permission_key") DO NOTHING;

INSERT INTO "role_permission" ("id", "role", "profile_id", "permission_key", "granted", "updated_at")
SELECT gen_random_uuid()::text, 'VIEWER'::"UserRole", '00000000-0000-4000-8000-0000000000v3', k, true, CURRENT_TIMESTAMP
FROM (VALUES
  ('notifications.view'),
  ('schedules.view'),
  ('documents.view'),
  ('profile.view')
) AS v(k)
ON CONFLICT ("profile_id", "permission_key") DO NOTHING;

-- Modelos de notificação
CREATE TABLE "notification_template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document_title" TEXT NOT NULL,
    "email_subject" TEXT NOT NULL,
    "purpose" "NotificationPurpose" NOT NULL DEFAULT 'OUTRO',
    "notification_type" "NotificationType" NOT NULL DEFAULT 'NOTIFICACAO_FORMAL',
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFORMATIVA',
    "default_response_days" INTEGER NOT NULL DEFAULT 5,
    "requires_ack" BOOLEAN NOT NULL DEFAULT true,
    "requires_response" BOOLEAN NOT NULL DEFAULT false,
    "requires_schedule" BOOLEAN NOT NULL DEFAULT false,
    "requires_action_plan" BOOLEAN NOT NULL DEFAULT false,
    "review_flow" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "body_html" TEXT NOT NULL,
    "header_html" TEXT,
    "footer_html" TEXT,
    "mail_merge_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_template_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notification_template_active_name_idx" ON "notification_template"("active", "name");

CREATE TABLE "notification_template_version" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_template_version_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_template_version_template_id_version_key" ON "notification_template_version"("template_id", "version");
CREATE INDEX "notification_template_version_template_id_idx" ON "notification_template_version"("template_id");
ALTER TABLE "notification_template_version" ADD CONSTRAINT "notification_template_version_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "notification_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "contract_notification_sequence" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "contract_notification_sequence_pkey" PRIMARY KEY ("year")
);

CREATE TABLE "contract_notification" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "template_id" TEXT,
    "template_version" INTEGER NOT NULL DEFAULT 1,
    "number" TEXT NOT NULL,
    "status" "ContractNotificationStatus" NOT NULL DEFAULT 'RASCUNHO',
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "header_html" TEXT,
    "footer_html" TEXT,
    "signed_document_html" TEXT,
    "purpose" "NotificationPurpose" NOT NULL DEFAULT 'OUTRO',
    "notification_type" "NotificationType" NOT NULL DEFAULT 'NOTIFICACAO_FORMAL',
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFORMATIVA',
    "requires_ack" BOOLEAN NOT NULL DEFAULT true,
    "requires_response" BOOLEAN NOT NULL DEFAULT false,
    "requires_schedule" BOOLEAN NOT NULL DEFAULT false,
    "requires_action_plan" BOOLEAN NOT NULL DEFAULT false,
    "formalization_refs" JSONB,
    "ack_deadline" TIMESTAMP(3),
    "response_deadline" TIMESTAMP(3),
    "effects_start_rule" TEXT,
    "related" JSONB,
    "content_locked" BOOLEAN NOT NULL DEFAULT false,
    "cancel_reason" TEXT,
    "rectify_reason" TEXT,
    "parent_notification_id" TEXT,
    "ack_at" TIMESTAMP(3),
    "ack_by_user_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contract_notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contract_notification_number_key" ON "contract_notification"("number");
CREATE INDEX "contract_notification_contract_id_status_idx" ON "contract_notification"("contract_id", "status");
CREATE INDEX "contract_notification_status_created_at_idx" ON "contract_notification"("status", "created_at");
CREATE INDEX "contract_notification_created_by_id_idx" ON "contract_notification"("created_by_id");

ALTER TABLE "contract_notification" ADD CONSTRAINT "contract_notification_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_notification" ADD CONSTRAINT "contract_notification_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "notification_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_notification" ADD CONSTRAINT "contract_notification_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contract_notification" ADD CONSTRAINT "contract_notification_parent_notification_id_fkey"
  FOREIGN KEY ("parent_notification_id") REFERENCES "contract_notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "contract_notification_event" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "note" TEXT,
    "actor_id" TEXT,
    "actor_label" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contract_notification_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "contract_notification_event_notification_id_created_at_idx" ON "contract_notification_event"("notification_id", "created_at");
ALTER TABLE "contract_notification_event" ADD CONSTRAINT "contract_notification_event_notification_id_fkey"
  FOREIGN KEY ("notification_id") REFERENCES "contract_notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "contract_notification_signer" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "modality" "NotificationSignModality" NOT NULL DEFAULT 'PASSWORD',
    "signed_at" TIMESTAMP(3),
    "signer_name" TEXT,
    "signer_cpf" TEXT,
    "signer_job_title" TEXT,
    "signer_org_label" TEXT,
    "verification_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contract_notification_signer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contract_notification_signer_notification_id_user_id_key" ON "contract_notification_signer"("notification_id", "user_id");
CREATE INDEX "contract_notification_signer_notification_id_order_idx" ON "contract_notification_signer"("notification_id", "order");
ALTER TABLE "contract_notification_signer" ADD CONSTRAINT "contract_notification_signer_notification_id_fkey"
  FOREIGN KEY ("notification_id") REFERENCES "contract_notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_notification_signer" ADD CONSTRAINT "contract_notification_signer_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "contract_notification_response" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "item_statuses" JSONB,
    "draft" BOOLEAN NOT NULL DEFAULT true,
    "submitted_at" TIMESTAMP(3),
    "analysis_status" "NotificationManifestationAnalysis",
    "analysis_note" TEXT,
    "analyzed_at" TIMESTAMP(3),
    "analyzed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contract_notification_response_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "contract_notification_response_notification_id_draft_idx" ON "contract_notification_response"("notification_id", "draft");
ALTER TABLE "contract_notification_response" ADD CONSTRAINT "contract_notification_response_notification_id_fkey"
  FOREIGN KEY ("notification_id") REFERENCES "contract_notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_notification_response" ADD CONSTRAINT "contract_notification_response_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attachment" ADD COLUMN "notification_id" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "notification_response_id" TEXT;
CREATE INDEX "Attachment_notification_id_idx" ON "Attachment"("notification_id");
CREATE INDEX "Attachment_notification_response_id_idx" ON "Attachment"("notification_response_id");
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_notification_id_fkey"
  FOREIGN KEY ("notification_id") REFERENCES "contract_notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_notification_response_id_fkey"
  FOREIGN KEY ("notification_response_id") REFERENCES "contract_notification_response"("id") ON DELETE CASCADE ON UPDATE CASCADE;
