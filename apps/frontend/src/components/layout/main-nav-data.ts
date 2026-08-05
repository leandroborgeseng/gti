import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  BookOpen,
  ClipboardList,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  Flag,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Package,
  Settings,
  Shield,
  Target,
  Ticket,
  UserCog,
  UserRoundCheck,
  Wallet
} from "lucide-react";

export type MainNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: true;
  hideForViewer?: true;
};

export type MainNavGroup = {
  id: string;
  label: string;
  items: MainNavItem[];
};

/** Grupos da barra lateral / menu mobile (sanfona). */
export const MAIN_NAV_GROUPS: MainNavGroup[] = [
  {
    id: "painel-operacao",
    label: "Painel e operação",
    items: [
      { href: "/dashboard", label: "Painel executivo", icon: LayoutDashboard },
      { href: "/prazos-pendencias", label: "Prazos e pendências", icon: AlarmClock },
      { href: "/resumo-operacional", label: "Resumo operacional", icon: ClipboardCheck },
      { href: "/minhas-atribuicoes", label: "Minhas atribuições", icon: UserRoundCheck },
      { href: "/chamados", label: "Chamados (GLPI)", icon: Ticket }
    ]
  },
  {
    id: "contratos-medicao",
    label: "Contratos e medição",
    items: [
      { href: "/contracts", label: "Contratos", icon: FileText },
      { href: "/modulos", label: "Funcionalidades", icon: ListChecks },
      { href: "/measurements", label: "Medições", icon: ClipboardList },
      { href: "/glosas", label: "Glosas", icon: Wallet }
    ]
  },
  {
    id: "governanca-planejamento",
    label: "Governança e planejamento",
    items: [
      { href: "/governance/tickets", label: "Governança SLA", icon: Shield },
      { href: "/goals", label: "Metas", icon: Target },
      { href: "/projetos", label: "Projetos", icon: Flag }
    ]
  },
  {
    id: "cadastros-relatorios",
    label: "Cadastros e relatórios",
    items: [
      { href: "/suppliers", label: "Fornecedores", icon: Package },
      { href: "/fiscais", label: "Fiscais", icon: UserCog },
      { href: "/exports", label: "Exportações", icon: FileSpreadsheet, hideForViewer: true },
      { href: "/manual", label: "Manual do sistema", icon: BookOpen },
      { href: "/notas-versao", label: "Notas de versão", icon: Megaphone }
    ]
  },
  {
    id: "administracao",
    label: "Administração",
    items: [{ href: "/administracao", label: "Administração", icon: Settings, adminOnly: true }]
  }
];

const NAV_REQUIRED_PERMISSIONS: Record<string, readonly string[]> = {
  "/dashboard": ["dashboard.view"],
  "/prazos-pendencias": ["deadlines.view"],
  "/contracts": ["contracts.view"],
  "/modulos": ["contracts.features.view"],
  "/measurements": ["measurements.view"],
  "/glosas": ["glosas.view"],
  "/governance/tickets": ["governance.view"],
  "/goals": ["goals.view"],
  "/projetos": ["projects.view"],
  "/suppliers": ["suppliers.view"],
  "/fiscais": ["fiscais.view"],
  "/exports": ["exports.run"],
  "/administracao": [
    "admin.users.view",
    "admin.organs.view",
    "admin.permissions.view",
    "admin.item_types.view",
    "admin.contract_types.view",
    "admin.hiring_types.view",
    "admin.backup.manage",
    "admin.email.manage",
    "admin.audit.manage"
  ]
};

/**
 * Filtra entradas conforme o papel e as permissões efetivas do usuário.
 * `role === undefined` = ainda carregando: mostra só entradas não exclusivas de admin.
 */
export function filterMainNavByRole(
  items: MainNavItem[],
  role: string | null | undefined,
  permissionKeys?: readonly string[] | null
): MainNavItem[] {
  if (role === undefined) {
    return items.filter((i) => !i.adminOnly);
  }
  return items.filter((item) => {
    if (item.adminOnly && role !== "ADMIN" && permissionKeys == null) {
      return false;
    }
    if (item.hideForViewer && role === "VIEWER") {
      return false;
    }
    const requiredPermissions = NAV_REQUIRED_PERMISSIONS[item.href];
    if (permissionKeys && requiredPermissions && !requiredPermissions.some((key) => permissionKeys.includes(key))) {
      return false;
    }
    return true;
  });
}

/** Grupos com itens visíveis para o papel; remove grupos vazios. */
export function filterMainNavGroups(
  groups: MainNavGroup[],
  role: string | null | undefined,
  permissionKeys?: readonly string[] | null
): MainNavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: filterMainNavByRole(group.items, role, permissionKeys)
    }))
    .filter((g) => g.items.length > 0);
}
