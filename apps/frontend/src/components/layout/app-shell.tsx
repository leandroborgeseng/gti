"use client";

import { BookOpen, ChevronsRight, LogOut, Megaphone } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { getAuthMe } from "@/lib/api";
import { PageTransition } from "@/components/layout/page-transition";
import { Button } from "@/components/ui/button";
import { filterMainNavGroups, MAIN_NAV_GROUPS } from "./main-nav-data";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";

const SIDEBAR_STORAGE_KEY = "gti-sidebar-collapsed";

const titles: Record<string, string> = {
  "/dashboard": "Painel executivo",
  "/chamados": "Chamados GLPI",
  "/contracts": "Contratos",
  "/modulos": "Funcionalidades",
  "/measurements": "Medições",
  "/glosas": "Glosas",
  "/governance/tickets": "Governança de chamados",
  "/goals": "Metas estratégicas",
  "/projetos": "Projetos",
  "/suppliers": "Fornecedores",
  "/fiscais": "Fiscais",
  "/reports": "Relatórios",
  "/reports/fechamento-mensal": "Fechamento mensal",
  "/manual": "Manual do sistema",
  "/notas-versao": "Notas de versão",
  "/users": "Usuários",
  "/exports": "Exportações"
};

type AppShellProps = PropsWithChildren<{
  initialRole?: string | null;
}>;

export function AppShell({ children, initialRole }: AppShellProps): JSX.Element {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null | undefined>(initialRole);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const persistSidebarCollapsed = useCallback((collapsed: boolean) => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* localStorage indisponível */
    }
    setSidebarCollapsed(collapsed);
  }, []);

  const collapseSidebar = useCallback(() => persistSidebarCollapsed(true), [persistSidebarCollapsed]);
  const expandSidebar = useCallback(() => persistSidebarCollapsed(false), [persistSidebarCollapsed]);

  useEffect(() => {
    if (initialRole !== undefined) return;
    void getAuthMe()
      .then((m) => setRole(m.role))
      .catch(() => setRole(null));
  }, [initialRole]);

  useLayoutEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1");
    } catch {
      setSidebarCollapsed(false);
    }
  }, []);

  const visibleNavGroups = useMemo(() => filterMainNavGroups(MAIN_NAV_GROUPS, role), [role]);

  const title =
    titles[pathname ?? ""] ||
    (pathname?.startsWith("/contracts/")
      ? "Detalhe do contrato"
      : pathname?.startsWith("/measurements/")
        ? "Detalhe da medição"
        : pathname?.startsWith("/glosas/")
          ? "Detalhe da glosa"
          : pathname?.startsWith("/governance/tickets/")
            ? "Detalhe do chamado (governança)"
            : pathname?.startsWith("/projetos/")
              ? "Detalhe do projeto"
              : pathname?.startsWith("/goals/")
                ? "Detalhe da meta"
                : pathname?.startsWith("/reports/")
                  ? "Relatórios"
                  : "Gestão de Operações de TI");

  return (
    <div className="flex min-h-screen bg-muted/30">
      {!sidebarCollapsed ? <Sidebar groups={visibleNavGroups} onCollapse={collapseSidebar} /> : null}
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b-2 border-primary/90 bg-background/90 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 md:px-6 md:py-3.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {sidebarCollapsed ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="hidden h-9 w-9 shrink-0 md:inline-flex"
                  title="Abrir menu"
                  aria-label="Abrir menu de navegação"
                  onClick={expandSidebar}
                >
                  <ChevronsRight className="h-4 w-4" aria-hidden />
                </Button>
              ) : null}
              <MobileNav groups={visibleNavGroups} />
              <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight text-primary">{title}</h2>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
              <Link
                href="/manual"
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 font-medium text-foreground transition hover:border-primary/50 hover:text-primary"
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                Manual
              </Link>
              <Link
                href="/notas-versao"
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 font-medium text-foreground transition hover:border-primary/50 hover:text-primary"
              >
                <Megaphone className="h-3.5 w-3.5" aria-hidden />
                Notas de versão
              </Link>
              <span className="hidden sm:inline">Área autenticada</span>
              <a
                href="/api/auth/logout"
                className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Sair
              </a>
            </div>
          </div>
        </header>
        <div className="p-6 md:p-8">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
}
