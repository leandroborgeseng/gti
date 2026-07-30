/** Estrutura hierárquica de permissões (chaves alinhadas ao backend). */
export type PermissionLeaf = {
  key: string;
  label: string;
};

export type PermissionModule = {
  id: string;
  label: string;
  permissions: PermissionLeaf[];
};

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    id: "painel",
    label: "Painel e operação",
    permissions: [{ key: "dashboard.view", label: "Ver painel executivo" }]
  },
  {
    id: "contratos",
    label: "Contratos",
    permissions: [
      { key: "contracts.view", label: "Ver contratos" },
      { key: "contracts.create", label: "Criar contratos" },
      { key: "contracts.edit", label: "Editar contratos" },
      { key: "contracts.internal_code.regenerate", label: "Regenerar código interno" },
      { key: "contracts.delete", label: "Excluir contratos" },
      { key: "contracts.financial.view", label: "Ver dados financeiros" },
      { key: "contracts.features.view", label: "Ver funcionalidades" },
      { key: "contracts.features.edit_delivery", label: "Alterar entrega de funcionalidades" },
      { key: "contracts.features.edit_criticality", label: "Alterar criticidade" }
    ]
  },
  {
    id: "medicoes",
    label: "Medições",
    permissions: [
      { key: "measurements.view", label: "Ver medições" },
      { key: "measurements.create", label: "Criar medições" },
      { key: "measurements.edit", label: "Editar medições" }
    ]
  },
  {
    id: "glosas",
    label: "Glosas",
    permissions: [
      { key: "glosas.view", label: "Ver glosas" },
      { key: "glosas.create", label: "Criar glosas" }
    ]
  },
  {
    id: "governanca",
    label: "Governança",
    permissions: [{ key: "governance.view", label: "Ver governança SLA" }]
  },
  {
    id: "metas",
    label: "Metas",
    permissions: [{ key: "goals.view", label: "Ver metas" }]
  },
  {
    id: "projetos",
    label: "Projetos",
    permissions: [
      { key: "projects.view", label: "Ver projetos" },
      { key: "projects.edit", label: "Editar projetos" }
    ]
  },
  {
    id: "cadastros",
    label: "Cadastros",
    permissions: [
      { key: "suppliers.view", label: "Ver fornecedores" },
      { key: "fiscais.view", label: "Ver fiscais" }
    ]
  },
  {
    id: "relatorios",
    label: "Relatórios e exportações",
    permissions: [
      { key: "reports.view", label: "Ver relatórios" },
      { key: "exports.run", label: "Executar exportações CSV" }
    ]
  },
  {
    id: "manual",
    label: "Manual",
    permissions: [{ key: "manual.view", label: "Ver manual do sistema" }]
  },
  {
    id: "administracao",
    label: "Administração",
    permissions: [
      { key: "admin.users.view", label: "Ver usuários" },
      { key: "admin.users.manage", label: "Gerenciar usuários" },
      { key: "admin.organs.view", label: "Ver órgãos" },
      { key: "admin.organs.manage", label: "Gerenciar órgãos" },
      { key: "admin.permissions.view", label: "Ver permissões" },
      { key: "admin.permissions.manage", label: "Gerenciar permissões" },
      { key: "admin.item_types.view", label: "Ver tipos de itens" },
      { key: "admin.item_types.manage", label: "Gerenciar tipos de itens" },
      { key: "admin.contract_types.view", label: "Ver tipos de contrato" },
      { key: "admin.contract_types.manage", label: "Gerenciar tipos de contrato" },
      { key: "admin.hiring_types.view", label: "Ver tipos de contratação" },
      { key: "admin.hiring_types.manage", label: "Gerenciar tipos de contratação" },
      { key: "admin.backup.manage", label: "Gerenciar backup e migração" }
    ]
  }
];

export const ALL_PERMISSION_KEYS = PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => p.key));
