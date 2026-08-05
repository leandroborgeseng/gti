-- Configuração de eventos de auditoria (ticket 68).

CREATE TABLE IF NOT EXISTS "audit_event_config" (
    "id" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "screen_key" TEXT NOT NULL,
    "action_key" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "module_label" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "detail_level" TEXT NOT NULL DEFAULT 'ACTION_AND_VALUES',
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_event_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "audit_event_config_module_key_screen_key_action_key_key"
  ON "audit_event_config"("module_key", "screen_key", "action_key");
CREATE INDEX IF NOT EXISTS "audit_event_config_module_key_sort_order_idx"
  ON "audit_event_config"("module_key", "sort_order");

INSERT INTO "audit_event_config" (
  "id", "module_key", "screen_key", "action_key", "label", "module_label",
  "enabled", "detail_level", "mandatory", "sort_order", "created_at", "updated_at"
) VALUES
  ('aec_7c4e09489d2d73def3479d18', 'auth', 'session', 'LOGIN', 'Login', 'Acesso', true, 'ACTION_AND_VALUES', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_8b427b30fce740d1f7a86b7a', 'auth', 'session', 'LOGOUT', 'Logout', 'Acesso', true, 'ACTION_AND_VALUES', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_a8b5d9b7d8a61cf0b77509ec', 'admin', 'users', 'CREATE', 'Criar usuário', 'Administração', true, 'ACTION_AND_VALUES', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_83f6ba4e24402c434e477247', 'admin', 'users', 'UPDATE', 'Editar usuário', 'Administração', true, 'ACTION_AND_VALUES', false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_19de0c0152505c094fffd0ea', 'admin', 'users', 'DELETE', 'Excluir usuário', 'Administração', true, 'ACTION_AND_VALUES', false, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_662e4a1cffd229f20c3b9c45', 'admin', 'users', 'APPROVE', 'Aprovar usuário', 'Administração', true, 'ACTION_AND_VALUES', false, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_72647de69120e63533e30e85', 'admin', 'permissions', 'UPDATE', 'Alterar permissões', 'Administração', true, 'ACTION_AND_VALUES', true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_9ef10558c33ef63ca98e26cb', 'admin', 'organizations', 'CREATE', 'Criar órgão', 'Administração', true, 'ACTION_AND_VALUES', false, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_6b07d302aa4de5fc622c79c2', 'admin', 'organizations', 'UPDATE', 'Editar órgão', 'Administração', true, 'ACTION_AND_VALUES', false, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_09d2b16b868907c259208152', 'admin', 'audit_config', 'UPDATE', 'Alterar configuração de auditoria', 'Administração', true, 'ACTION_AND_VALUES', true, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_91fa9626c1ad25fa59bdf09b', 'admin', 'email_config', 'UPDATE', 'Alterar configuração de e-mail', 'Administração', true, 'ACTION_AND_VALUES', false, 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_976817e3eb2ac1194717de69', 'admin', 'email_config', 'TEST', 'Testar envio de e-mail', 'Administração', true, 'ACTION_AND_VALUES', false, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_36bc0e58bff5479d43cbcd25', 'contracts', 'contract', 'CREATE', 'Criar contrato', 'Contratos', true, 'ACTION_AND_VALUES', false, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_b4bb7184ba591fb0499a6c65', 'contracts', 'contract', 'UPDATE', 'Editar contrato', 'Contratos', true, 'ACTION_AND_VALUES', false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_9d752342f6fa470c7ebce398', 'contracts', 'contract', 'DELETE', 'Excluir contrato', 'Contratos', true, 'ACTION_AND_VALUES', false, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_2e99821cc864157423de7b32', 'contracts', 'contract', 'APPROVE', 'Aprovar contrato', 'Contratos', true, 'ACTION_AND_VALUES', false, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_1266196d8d0dde19c7cbbaaf', 'contracts', 'contract', 'AMEND', 'Registrar aditivo/reajuste', 'Contratos', true, 'ACTION_AND_VALUES', false, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_66b96542348dca4078412b86', 'contracts', 'structure', 'CREATE', 'Incluir item da estrutura', 'Contratos', true, 'ACTION_AND_VALUES', false, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_350a0c5c0b700d63c306cc78', 'contracts', 'structure', 'UPDATE', 'Editar item da estrutura', 'Contratos', true, 'ACTION_AND_VALUES', false, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_52e754dff63834bab177c738', 'contracts', 'structure', 'DELETE', 'Excluir item da estrutura', 'Contratos', true, 'ACTION_AND_VALUES', false, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_b056918c6ce729be9cc4c322', 'contracts', 'pricing', 'CREATE', 'Incluir item contratual', 'Contratos', true, 'ACTION_AND_VALUES', false, 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_cf68581bdd94a66ab036d112', 'contracts', 'pricing', 'UPDATE', 'Editar item contratual', 'Contratos', true, 'ACTION_AND_VALUES', false, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_863141204b1eb91a721e8f08', 'contracts', 'pricing', 'DELETE', 'Excluir item contratual', 'Contratos', true, 'ACTION_AND_VALUES', false, 110, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_303ec3a74e83bf180808c4da', 'measurements', 'measurement', 'CREATE', 'Criar medição', 'Medições', true, 'ACTION_AND_VALUES', false, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_0a68011814ad773e9f8589d6', 'measurements', 'measurement', 'UPDATE', 'Editar medição', 'Medições', true, 'ACTION_AND_VALUES', false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_796d9b55f2b40558d3de187d', 'measurements', 'measurement', 'APPROVE', 'Aprovar medição', 'Medições', true, 'ACTION_AND_VALUES', false, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_01c8bf512167a2285f80f25d', 'measurements', 'measurement', 'CALCULATE', 'Calcular medição', 'Medições', true, 'ACTION_AND_VALUES', false, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_971700779857639673e0b9d8', 'measurements', 'measurement', 'DELETE', 'Excluir medição', 'Medições', true, 'ACTION_AND_VALUES', false, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_74e1129766d8f1ce21b48cd6', 'glosas', 'glosa', 'CREATE', 'Criar glosa', 'Glosas', true, 'ACTION_AND_VALUES', false, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_cc726e8f8db974c284560749', 'glosas', 'glosa', 'UPDATE', 'Editar glosa', 'Glosas', true, 'ACTION_AND_VALUES', false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_eb2357dbb2852bd7212ab693', 'glosas', 'glosa', 'DELETE', 'Excluir glosa', 'Glosas', true, 'ACTION_AND_VALUES', false, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_e371e05ea060e3e0b32f791a', 'goals', 'goal', 'CREATE', 'Criar meta', 'Metas', true, 'ACTION_AND_VALUES', false, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_31e7699050af4cd0249fac06', 'goals', 'goal', 'UPDATE', 'Editar meta', 'Metas', true, 'ACTION_AND_VALUES', false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_a5917df522abcd9937a71a5f', 'goals', 'goal', 'DELETE', 'Excluir meta', 'Metas', true, 'ACTION_AND_VALUES', false, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_5fd9dc0d337d9e5433307af6', 'projects', 'project', 'CREATE', 'Criar projeto', 'Projetos', true, 'ACTION_AND_VALUES', false, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_254f09cc5f009420bf98cf3e', 'projects', 'project', 'UPDATE', 'Editar projeto', 'Projetos', true, 'ACTION_AND_VALUES', false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_783823824ea6a43074670cff', 'projects', 'task', 'CREATE', 'Criar tarefa', 'Projetos', true, 'ACTION_AND_VALUES', false, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_05eecbbc303305a0f193123d', 'projects', 'task', 'UPDATE', 'Editar tarefa', 'Projetos', true, 'ACTION_AND_VALUES', false, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_cc6c4d36b9df604fc1fd4c5d', 'projects', 'task', 'DELETE', 'Excluir tarefa', 'Projetos', true, 'ACTION_AND_VALUES', false, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_1ffee11a9252dee917927595', 'suppliers', 'supplier', 'CREATE', 'Criar fornecedor', 'Fornecedores', true, 'ACTION_AND_VALUES', false, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_619378a215621679794d873a', 'suppliers', 'supplier', 'UPDATE', 'Editar fornecedor', 'Fornecedores', true, 'ACTION_AND_VALUES', false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_04120ab57659d22091779408', 'fiscais', 'fiscal', 'CREATE', 'Criar fiscal', 'Fiscais', true, 'ACTION_AND_VALUES', false, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_a4267b626e3748a623cdebad', 'fiscais', 'fiscal', 'UPDATE', 'Editar fiscal', 'Fiscais', true, 'ACTION_AND_VALUES', false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_c0d46d01508d0f7a478e1749', 'governance', 'ticket', 'CREATE', 'Criar ticket de governança', 'Governança', true, 'ACTION_AND_VALUES', false, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aec_3e550e3ec15ce434a8b55075', 'governance', 'ticket', 'UPDATE', 'Editar ticket de governança', 'Governança', true, 'ACTION_AND_VALUES', false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("module_key", "screen_key", "action_key") DO NOTHING;

-- Permissão de gestão da configuração de auditoria (perfil Administrador)
INSERT INTO "role_permission" ("id", "role", "profile_id", "permission_key", "granted", "updated_at")
SELECT
  'rp_' || md5('ADMIN:admin.audit.manage'),
  'ADMIN'::"UserRole",
  ap."id",
  'admin.audit.manage',
  true,
  CURRENT_TIMESTAMP
FROM "access_profile" ap
WHERE ap."system_key" = 'ADMIN'
ON CONFLICT ("profile_id", "permission_key") DO NOTHING;
