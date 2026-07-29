-- Permite a regeneração excepcional de código interno apenas aos administradores.
INSERT INTO "role_permission" ("id", "role", "permission_key", "granted", "updated_at")
VALUES (
  'rp_' || md5('ADMIN:contracts.internal_code.regenerate'),
  'ADMIN'::"UserRole",
  'contracts.internal_code.regenerate',
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("role", "permission_key") DO NOTHING;
