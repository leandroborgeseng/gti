-- Configuração de e-mail de saída (SMTP) e histórico mínimo de envios (ticket 52).

CREATE TABLE IF NOT EXISTS "email_outbound_config" (
    "id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "smtp_host" TEXT NOT NULL DEFAULT '',
    "smtp_port" INTEGER NOT NULL DEFAULT 587,
    "security" TEXT NOT NULL DEFAULT 'STARTTLS',
    "auth_required" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT NOT NULL DEFAULT '',
    "password_enc" TEXT,
    "auth_method" TEXT NOT NULL DEFAULT 'USER_PASS',
    "oauth_client_id" TEXT,
    "oauth_tenant_id" TEXT,
    "oauth_refresh_token_enc" TEXT,
    "from_name" TEXT NOT NULL DEFAULT '',
    "from_email" TEXT NOT NULL DEFAULT '',
    "reply_to" TEXT NOT NULL DEFAULT '',
    "cc_default" TEXT NOT NULL DEFAULT '',
    "bcc_default" TEXT NOT NULL DEFAULT '',
    "failure_alert_email" TEXT NOT NULL DEFAULT '',
    "subject_prefix" TEXT NOT NULL DEFAULT '',
    "footer_signature" TEXT NOT NULL DEFAULT '',
    "confidentiality_text" TEXT NOT NULL DEFAULT '',
    "max_attachment_bytes" INTEGER NOT NULL DEFAULT 10485760,
    "max_recipients" INTEGER NOT NULL DEFAULT 50,
    "retry_interval_sec" INTEGER NOT NULL DEFAULT 60,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "attach_notification_pdf" BOOLEAN NOT NULL DEFAULT false,
    "attachments_as_link" BOOLEAN NOT NULL DEFAULT false,
    "require_portal_access" BOOLEAN NOT NULL DEFAULT false,
    "inbound_enabled" BOOLEAN NOT NULL DEFAULT false,
    "imap_host" TEXT NOT NULL DEFAULT '',
    "imap_port" INTEGER NOT NULL DEFAULT 993,
    "imap_security" TEXT NOT NULL DEFAULT 'SSL_TLS',
    "imap_username" TEXT NOT NULL DEFAULT '',
    "imap_password_enc" TEXT,
    "last_test_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "last_test_error" TEXT,
    "last_test_recipient" TEXT,
    "activation_justification" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_outbound_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "email_outbound_config" ("id", "updated_at")
VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "email_send_log" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipients" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "error_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_send_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_send_log_created_at_idx" ON "email_send_log"("created_at");
CREATE INDEX IF NOT EXISTS "email_send_log_type_status_idx" ON "email_send_log"("type", "status");

-- Permissão de gestão de e-mail (perfil Administrador)
INSERT INTO "role_permission" ("id", "role", "profile_id", "permission_key", "granted", "updated_at")
SELECT
  'rp_' || md5('ADMIN:admin.email.manage'),
  'ADMIN'::"UserRole",
  ap."id",
  'admin.email.manage',
  true,
  CURRENT_TIMESTAMP
FROM "access_profile" ap
WHERE ap."system_key" = 'ADMIN'
ON CONFLICT ("profile_id", "permission_key") DO NOTHING;
