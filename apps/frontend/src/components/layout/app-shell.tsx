"use client";

import { LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { PropsWithChildren, useEffect, useMemo, useState } from "react";
import { getAuthMe } from "@/lib/api";
import { PageTransition } from "@/components/layout/page-transition";
import { filterMainNavByRole, MAIN_NAV_ITEMS } from "./main-nav-data";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";

const titles: Record<string, string> = {
  "/dashboard": "Painel executivo",
  "/chamados": "Chamados GLPI",
  "/contracts": "Contratos",
  "/measurements": "Medições",
  "/glosas": "Glosas",
  "/governance/tickets": "Governança de chamados",
  "/goals": "Metas estratégicas",
  "/projetos": "Projetos",
  "/suppliers": "Fornecedores",
  "/fiscais": "Fiscais",
  "/reports": "Relatórios",
  "/users": "Utilizadores",
  "/exports": "Exportações"
};

export function AppShell({ children }: PropsWithChildren): JSX.Element {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void getAuthMe()
      .then((m) => setRole(m.role))
      .catch(() => setRole(null));
  }, []);

  const visibleNavItems = useMemo(() => filterMainNavByRole(MAIN_NAV_ITEMS, role), [role]);

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
                : "Gestão contratual");

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar items={visibleNavItems} />
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 md:px-6 md:py-3.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <MobileNav items={visibleNavItems} />
              <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
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
