import { UserRole } from "@prisma/client";

export type PermissionEntry = {
  key: string;
  label: string;
};

export type PermissionModuleGroup = {
  module: string;
  moduleKey: string;
  permissions: PermissionEntry[];
};

/** Catálogo hierárquico de permissões (paridade com seeds em migration.sql). */
export const PERMISSION_CATALOG: PermissionModuleGroup[] = [
  {
    module: "Dashboard",
    moduleKey: "dashboard",
    permissions: [{ key: "dashboard.view", label: "Visualizar dashboard" }]
  },
  {
    module: "Contratos",
    moduleKey: "contracts",
    permissions: [
      { key: "contracts.view", label: "Visualizar contratos" },
      { key: "contracts.create", label: "Criar contratos" },
      { key: "contracts.edit", label: "Editar contratos" },
      { key: "contracts.delete", label: "Excluir contratos" },
      { key: "contracts.financial.view", label: "Visualizar dados financeiros" },
      { key: "contracts.features.view", label: "Visualizar funcionalidades" },
      { key: "contracts.features.edit_delivery", label: "Alterar status de entrega" },
      { key: "contracts.features.edit_criticality", label: "Alterar criticidade" }
    ]
  },
  {
    module: "Medições",
    moduleKey: "measurements",
    permissions: [
      { key: "measurements.view", label: "Visualizar medições" },
      { key: "measurements.create", label: "Criar medições" },
      { key: "measurements.edit", label: "Editar medições" }
    ]
  },
  {
    module: "Glosas",
    moduleKey: "glosas",
    permissions: [
      { key: "glosas.view", label: "Visualizar glosas" },
      { key: "glosas.create", label: "Registrar glosas" }
    ]
  },
  {
    module: "Governança",
    moduleKey: "governance",
    permissions: [{ key: "governance.view", label: "Visualizar chamados de governança" }]
  },
  {
    module: "Metas",
    moduleKey: "goals",
    permissions: [{ key: "goals.view", label: "Visualizar metas" }]
  },
  {
    module: "Projetos",
    moduleKey: "projects",
    permissions: [
      { key: "projects.view", label: "Visualizar projetos" },
      { key: "projects.edit", label: "Editar projetos" }
    ]
  },
  {
    module: "Fornecedores",
    moduleKey: "suppliers",
    permissions: [{ key: "suppliers.view", label: "Visualizar fornecedores" }]
  },
  {
    module: "Fiscais e gestores",
    moduleKey: "fiscais",
    permissions: [{ key: "fiscais.view", label: "Visualizar fiscais e gestores" }]
  },
  {
    module: "Relatórios e exportações",
    moduleKey: "reports",
    permissions: [
      { key: "reports.view", label: "Visualizar relatórios" },
      { key: "exports.run", label: "Exportar dados (CSV)" }
    ]
  },
  {
    module: "Manual",
    moduleKey: "manual",
    permissions: [{ key: "manual.view", label: "Acessar manual do utilizador" }]
  },
  {
    module: "Administração — Usuários",
    moduleKey: "admin.users",
    permissions: [
      { key: "admin.users.view", label: "Visualizar usuários" },
      { key: "admin.users.manage", label: "Gerir usuários" }
    ]
  },
  {
    module: "Administração — Órgãos",
    moduleKey: "admin.organs",
    permissions: [
      { key: "admin.organs.view", label: "Visualizar órgãos" },
      { key: "admin.organs.manage", label: "Gerir órgãos" }
    ]
  },
  {
    module: "Administração — Permissões",
    moduleKey: "admin.permissions",
    permissions: [
      { key: "admin.permissions.view", label: "Visualizar permissões" },
      { key: "admin.permissions.manage", label: "Gerir permissões" }
    ]
  },
  {
    module: "Administração — Tipos de item",
    moduleKey: "admin.item_types",
    permissions: [
      { key: "admin.item_types.view", label: "Visualizar tipos de item" },
      { key: "admin.item_types.manage", label: "Gerir tipos de item" }
    ]
  },
  {
    module: "Administração — Tipos de contrato",
    moduleKey: "admin.contract_types",
    permissions: [
      { key: "admin.contract_types.view", label: "Visualizar tipos de contrato" },
      { key: "admin.contract_types.manage", label: "Gerir tipos de contrato" }
    ]
  },
  {
    module: "Administração — Tipos de contratação",
    moduleKey: "admin.hiring_types",
    permissions: [
      { key: "admin.hiring_types.view", label: "Visualizar tipos de contratação" },
      { key: "admin.hiring_types.manage", label: "Gerir tipos de contratação" }
    ]
  },
  {
    module: "Administração — Backup",
    moduleKey: "admin.backup",
    permissions: [{ key: "admin.backup.manage", label: "Gerir backup do sistema" }]
  }
];

export const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.flatMap((g) => g.permissions.map((p) => p.key));

export function isValidPermissionKey(key: string): boolean {
  return ALL_PERMISSION_KEYS.includes(key);
}

export function isValidUserRole(role: string): role is UserRole {
  return Object.values(UserRole).includes(role as UserRole);
}
