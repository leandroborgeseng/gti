-- Backup automático S3 (Administração → Backup e migração)
CREATE TABLE IF NOT EXISTS "s3_backup_config" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "bucket" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "access_key_id" TEXT NOT NULL DEFAULT '',
    "secret_access_key_enc" TEXT,
    "endpoint" TEXT,
    "force_path_style" BOOLEAN NOT NULL DEFAULT true,
    "prefix" TEXT NOT NULL DEFAULT 'gti/backups',
    "hour" INTEGER NOT NULL DEFAULT 3,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "keep_daily" INTEGER NOT NULL DEFAULT 7,
    "keep_weekly" INTEGER NOT NULL DEFAULT 5,
    "keep_monthly" INTEGER NOT NULL DEFAULT 12,
    "env_imported_at" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "last_run_status" TEXT,
    "last_run_error" TEXT,
    "last_run_trigger" TEXT,
    "last_run_object_key" TEXT,
    "last_run_bytes" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "s3_backup_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "s3_backup_config" ("id", "updated_at")
VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
