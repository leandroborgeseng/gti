import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Flag,
  LayoutDashboard,
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

/** Itens da barra lateral / menu mobile (ordem = ordem na UI). */
export const MAIN_NAV_ITEMS: MainNavItem[] = [
  { href: "/dashboard", label: "Painel executivo", icon: LayoutDashboard },
  { href: "/chamados", label: "Chamados (GLPI)", icon: Ticket },
  { href: "/contracts", label: "Contratos", icon: FileText },
  { href: "/measurements", label: "Medições", icon: ClipboardList },
  { href: "/glosas", label: "Glosas", icon: Wallet },
  { href: "/governance/tickets", label: "Governança SLA", icon: Shield },
  { href: "/goals", label: "Metas", icon: Target },
  { href: "/projetos", label: "Projetos", icon: Flag },
  { href: "/suppliers", label: "Fornecedores", icon: Package },
  { href: "/fiscais", label: "Fiscais", icon: UserCog },
  { href: "/exports", label: "Exportações", icon: FileSpreadsheet, hideForViewer: true },
  { href: "/reports", label: "Relatórios", icon: BarChart3 },
  { href: "/users", label: "Utilizadores", icon: Users, adminOnly: true }
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
