import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  Bell,
  BookOpen,
  CalendarRange,
  ClipboardList,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  Flag,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Package,
  Settings,
  Shield,
  Target,
  Ticket,
  UserCog,
  UserCircle,
  UserRoundCheck,
  Wallet
} from "lucide-react";

export type MainNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: true;
  hideForViewer?: true;
  /** Visível apenas para usuários externos (portal empresa). */
  externalOnly?: true;
  /** Oculto para usuários externos. */
  hideForExternal?: true;
};

export type MainNavGroup = {
  id: string;
  label: string;
  items: MainNavItem[];
};

/** Grupos da barra lateral / menu mobile (sanfona). */
export const MAIN_NAV_GROUPS: MainNavGroup[] = [
  {
    id: "portal-externo",
    label: "Portal da empresa",
    items: [
      { href: "/externo/contratos", label: "Meus contratos", icon: FileText, externalOnly: true },
      { href: "/externo/notificacoes", label: "Notificações", icon: Bell, externalOnly: true },
      { href: "/externo/cronogramas", label: "Cronogramas", icon: CalendarRange, externalOnly: true },
      { href: "/externo/documentos", label: "Documentos", icon: FolderOpen, externalOnly: true },
      { href: "/perfil", label: "Meu perfil", icon: UserCircle, externalOnly: true }
    ]
  },
  {
    id: "painel-operacao",
    label: "Painel e operação",
    items: [
      { href: "/dashboard", label: "Painel executivo", icon: LayoutDashboard, hideForExternal: true },
      { href: "/prazos-pendencias", label: "Prazos e pendências", icon: AlarmClock, hideForExternal: true },
      { href: "/resumo-operacional", label: "Resumo operacional", icon: ClipboardCheck, hideForExternal: true },
      { href: "/minhas-atribuicoes", label: "Minhas atribuições", icon: UserRoundCheck, hideForExternal: true },
      { href: "/chamados", label: "Chamados (GLPI)", icon: Ticket, hideForExternal: true }
    ]
  },
  {
    id: "contratos-medicao",
    label: "Contratos e medição",
    items: [
      { href: "/contracts", label: "Contratos", icon: FileText, hideForExternal: true },
      { href: "/modulos", label: "Funcionalidades", icon: ListChecks, hideForExternal: true },
      { href: "/measurements", label: "Medições", icon: ClipboardList, hideForExternal: true },
      { href: "/glosas", label: "Glosas", icon: Wallet, hideForExternal: true }
    ]
  },
  {
    id: "governanca-planejamento",
    label: "Governança e planejamento",
    items: [
      { href: "/governance/tickets", label: "Governança SLA", icon: Shield, hideForExternal: true },
      { href: "/goals", label: "Metas", icon: Target, hideForExternal: true },
      { href: "/projetos", label: "Projetos", icon: Flag, hideForExternal: true }
    ]
  },
  {
    id: "cadastros-relatorios",
    label: "Cadastros e relatórios",
    items: [
      { href: "/suppliers", label: "Fornecedores", icon: Package, hideForExternal: true },
      { href: "/fiscais", label: "Fiscais", icon: UserCog, hideForExternal: true },
      { href: "/exports", label: "Exportações", icon: FileSpreadsheet, hideForViewer: true, hideForExternal: true },
      { href: "/manual", label: "Manual do sistema", icon: BookOpen, hideForExternal: true },
      { href: "/notas-versao", label: "Notas de versão", icon: Megaphone, hideForExternal: true }
    ]
  },
  {
    id: "administracao",
    label: "Administração",
    items: [{ href: "/administracao", label: "Administração", icon: Settings, adminOnly: true, hideForExternal: true }]
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
  "/externo/contratos": ["contracts.view"],
  "/externo/notificacoes": ["notifications.view"],
  "/externo/cronogramas": ["schedules.view"],
  "/externo/documentos": ["documents.view"],
  "/perfil": ["profile.view"],
  "/administracao": [
    "admin.users.view",
    "admin.organs.view",
    "admin.permissions.view",
    "admin.item_types.view",
    "admin.contract_types.view",
    "admin.hiring_types.view",
    "admin.backup.manage",
    "admin.email.manage",
    "admin.audit.manage",
    "notification_templates.manage"
  ]
};

/**
 * Filtra entradas conforme o papel e as permissões efetivas do usuário.
 * `role === undefined` = ainda carregando: mostra só entradas não exclusivas de admin.
 */
export function filterMainNavByRole(
  items: MainNavItem[],
  role: string | null | undefined,
  permissionKeys?: readonly string[] | null,
  opts?: { userKind?: "INTERNAL" | "EXTERNAL" | null; systemKey?: string | null }
): MainNavItem[] {
  const isExternal = opts?.userKind === "EXTERNAL" || opts?.systemKey === "EXTERNAL";
  if (role === undefined) {
    // Enquanto carrega: externo só vê portal; interno não vê itens exclusivos do portal.
    if (isExternal) return items.filter((i) => Boolean(i.externalOnly));
    return items.filter((i) => !i.adminOnly && !i.externalOnly);
  }
  return items.filter((item) => {
    if (item.externalOnly && !isExternal) return false;
    if (item.hideForExternal && isExternal) return false;
    if (isExternal && !item.externalOnly) return false;
    if (item.adminOnly && role !== "ADMIN" && permissionKeys == null) {
      return false;
    }
    if (item.hideForViewer && role === "VIEWER" && !isExternal) {
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
  permissionKeys?: readonly string[] | null,
  opts?: { userKind?: "INTERNAL" | "EXTERNAL" | null; systemKey?: string | null }
): MainNavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: filterMainNavByRole(group.items, role, permissionKeys, opts)
    }))
    .filter((g) => g.items.length > 0);
}
