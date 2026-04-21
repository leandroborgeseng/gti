import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Flag,
  LayoutDashboard,
  ListChecks,
  Package,
  Shield,
  Target,
  Ticket,
  UserCog,
  Users,
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
    id: "governanca-planeamento",
    label: "Governança e planeamento",
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
      { href: "/reports", label: "Relatórios", icon: BarChart3 }
    ]
  },
  {
    id: "administracao",
    label: "Administração",
    items: [{ href: "/users", label: "Utilizadores", icon: Users, adminOnly: true }]
  }
];

/**
 * Filtra entradas consoante o papel do utilizador.
 * `role === undefined` = ainda a carregar: mostra só entradas não exclusivas de admin.
 */
export function filterMainNavByRole(
  items: MainNavItem[],
  role: string | null | undefined
): MainNavItem[] {
  if (role === undefined) {
    return items.filter((i) => !i.adminOnly);
  }
  return items.filter((item) => {
    if (item.adminOnly && role !== "ADMIN") {
      return false;
    }
    if (item.hideForViewer && role === "VIEWER") {
      return false;
    }
    return true;
  });
}

/** Grupos com itens visíveis para o papel; remove grupos vazios. */
export function filterMainNavGroups(
  groups: MainNavGroup[],
  role: string | null | undefined
): MainNavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: filterMainNavByRole(group.items, role)
    }))
    .filter((g) => g.items.length > 0);
}
