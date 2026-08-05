-- Multi-perfil, multi-órgão e contexto ativo (tickets 59–66).

-- 1) Perfis de acesso dinâmicos
CREATE TABLE "access_profile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "name_normalized" TEXT NOT NULL,
    "system_key" TEXT,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_profile_name_normalized_key" ON "access_profile"("name_normalized");
CREATE UNIQUE INDEX "access_profile_system_key_key" ON "access_profile"("system_key");

-- Seed dos três perfis de sistema
INSERT INTO "access_profile" ("id", "name", "description", "active", "name_normalized", "system_key", "protected", "created_at", "updated_at")
VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Administrador', 'Perfil de sistema com acesso administrativo completo.', true, 'administrador', 'ADMIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-0000000000e2', 'Editor', 'Perfil de sistema com permissão de edição operacional.', true, 'editor', 'EDITOR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-0000000000v3', 'Leitor', 'Perfil de sistema somente leitura.', true, 'leitor', 'VIEWER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 2) Tabelas N:N
CREATE TABLE "user_access_profile" (
    "user_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_access_profile_pkey" PRIMARY KEY ("user_id","profile_id")
);

CREATE INDEX "user_access_profile_profile_id_idx" ON "user_access_profile"("profile_id");

CREATE TABLE "user_organization" (
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_organization_pkey" PRIMARY KEY ("user_id","organization_id")
);

CREATE INDEX "user_organization_organization_id_idx" ON "user_organization"("organization_id");

-- 3) Campos de contexto no User
ALTER TABLE "User" ADD COLUMN "all_organizations" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "last_active_profile_id" TEXT;
ALTER TABLE "User" ADD COLUMN "last_active_organization_id" TEXT;
ALTER TABLE "User" ADD COLUMN "default_profile_id" TEXT;
ALTER TABLE "User" ADD COLUMN "default_organization_id" TEXT;

-- 4) Migrar RolePermission: profileId
ALTER TABLE "role_permission" ADD COLUMN "profile_id" TEXT;

UPDATE "role_permission" rp
SET "profile_id" = ap."id"
FROM "access_profile" ap
WHERE ap."system_key" = rp."role"::text;

ALTER TABLE "role_permission" ALTER COLUMN "profile_id" SET NOT NULL;

DROP INDEX IF EXISTS "role_permission_role_permission_key_key";
CREATE UNIQUE INDEX "role_permission_profile_id_permission_key_key" ON "role_permission"("profile_id", "permission_key");
CREATE INDEX "role_permission_profile_id_idx" ON "role_permission"("profile_id");

-- 5) Migrar UserPermission: profileId (perfil do systemKey = role atual)
ALTER TABLE "user_permission" ADD COLUMN "profile_id" TEXT;

UPDATE "user_permission" up
SET "profile_id" = ap."id"
FROM "User" u
JOIN "access_profile" ap ON ap."system_key" = u."role"::text
WHERE up."user_id" = u."id";

-- Extras órfãos (usuário sem role mapeável) → Editor
UPDATE "user_permission"
SET "profile_id" = '00000000-0000-4000-8000-0000000000e2'
WHERE "profile_id" IS NULL;

ALTER TABLE "user_permission" ALTER COLUMN "profile_id" SET NOT NULL;

DROP INDEX IF EXISTS "user_permission_user_id_permission_key_key";
CREATE UNIQUE INDEX "user_permission_user_id_profile_id_permission_key_key" ON "user_permission"("user_id", "profile_id", "permission_key");
CREATE INDEX "user_permission_profile_id_idx" ON "user_permission"("profile_id");

-- 6) Migrar vínculos de usuários
INSERT INTO "user_access_profile" ("user_id", "profile_id", "is_default", "created_at")
SELECT u."id", ap."id", true, CURRENT_TIMESTAMP
FROM "User" u
JOIN "access_profile" ap ON ap."system_key" = u."role"::text;

INSERT INTO "user_organization" ("user_id", "organization_id", "is_default", "created_at")
SELECT u."id", u."organization_id", true, CURRENT_TIMESTAMP
FROM "User" u
WHERE u."organization_id" IS NOT NULL;

UPDATE "User" u
SET
  "default_profile_id" = ap."id",
  "last_active_profile_id" = ap."id",
  "default_organization_id" = u."organization_id",
  "last_active_organization_id" = u."organization_id"
FROM "access_profile" ap
WHERE ap."system_key" = u."role"::text;

-- Contas sem órgão legado mantêm visão global (equivalente a «Todos os órgãos»).
UPDATE "User"
SET "all_organizations" = true
WHERE "organization_id" IS NULL;

-- 7) FKs
ALTER TABLE "user_access_profile"
ADD CONSTRAINT "user_access_profile_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_access_profile"
ADD CONSTRAINT "user_access_profile_profile_id_fkey"
FOREIGN KEY ("profile_id") REFERENCES "access_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_organization"
ADD CONSTRAINT "user_organization_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_organization"
ADD CONSTRAINT "user_organization_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permission"
ADD CONSTRAINT "role_permission_profile_id_fkey"
FOREIGN KEY ("profile_id") REFERENCES "access_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_permission"
ADD CONSTRAINT "user_permission_profile_id_fkey"
FOREIGN KEY ("profile_id") REFERENCES "access_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_last_active_profile_id_fkey"
FOREIGN KEY ("last_active_profile_id") REFERENCES "access_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_last_active_organization_id_fkey"
FOREIGN KEY ("last_active_organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_default_profile_id_fkey"
FOREIGN KEY ("default_profile_id") REFERENCES "access_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_default_organization_id_fkey"
FOREIGN KEY ("default_organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_last_active_profile_id_idx" ON "User"("last_active_profile_id");
CREATE INDEX "User_last_active_organization_id_idx" ON "User"("last_active_organization_id");
CREATE INDEX "User_default_profile_id_idx" ON "User"("default_profile_id");
CREATE INDEX "User_default_organization_id_idx" ON "User"("default_organization_id");
