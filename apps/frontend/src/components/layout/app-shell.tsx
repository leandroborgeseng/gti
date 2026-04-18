"use client";

import { PropsWithChildren } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";

const titles: Record<string, string> = {
  "/dashboard": "Painel executivo",
  "/chamados": "Chamados GLPI",
  "/contracts": "Contratos",
  "/measurements": "Medições",
  "/glosas": "Glosas",
  "/governance/tickets": "Governança de chamados",
  "/goals": "Metas estratégicas",
  "/suppliers": "Fornecedores",
  "/fiscais": "Fiscais",
  "/reports": "Relatórios",
  "/users": "Utilizadores",
  "/exports": "Exportações"
};

export function AppShell({ children }: PropsWithChildren): JSX.Element {
  const pathname = usePathname();
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
            : pathname?.startsWith("/goals/")
              ? "Detalhe da meta"
              : "Gestão contratual");

  return (
    <div className="flex min-h-screen bg-slate-100/60">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b border-slate-200/90 bg-white/90 px-6 py-3.5 backdrop-blur-md">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>Área autenticada</span>
              <a href="/api/auth/logout" className="font-medium text-slate-700 underline hover:text-slate-900">
                Sair
              </a>
            </div>
          </div>
        </header>
        <div className="p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
