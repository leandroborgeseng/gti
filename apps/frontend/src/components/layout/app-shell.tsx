"use client";

import { PropsWithChildren } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/contracts": "Contratos",
  "/measurements": "Medições",
  "/glosas": "Glosas",
  "/suppliers": "Fornecedores",
  "/fiscais": "Fiscais",
  "/reports": "Relatórios"
};

export function AppShell({ children }: PropsWithChildren): JSX.Element {
  const pathname = usePathname();
  const title =
    titles[pathname ?? ""] ||
    (pathname?.startsWith("/contracts/") ? "Detalhe do Contrato" : pathname?.startsWith("/measurements/") ? "Detalhe da Medição" : "Gestão Contratual");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <header className="border-b border-border bg-white px-6 py-4">
          <h2 className="text-xl font-semibold">{title}</h2>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
