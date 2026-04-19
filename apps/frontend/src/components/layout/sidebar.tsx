"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuthMe } from "@/lib/api";

type NavItem = { href: string; label: string; adminOnly?: true; hideForViewer?: true };

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Painel executivo" },
  { href: "/chamados", label: "Chamados (GLPI)" },
  { href: "/contracts", label: "Contratos" },
  { href: "/measurements", label: "Medições" },
  { href: "/glosas", label: "Glosas" },
  { href: "/governance/tickets", label: "Governança SLA" },
  { href: "/goals", label: "Metas" },
  { href: "/projetos", label: "Projetos" },
  { href: "/suppliers", label: "Fornecedores" },
  { href: "/fiscais", label: "Fiscais" },
  { href: "/exports", label: "Exportações", hideForViewer: true },
  { href: "/reports", label: "Relatórios" },
  { href: "/users", label: "Utilizadores", adminOnly: true }
];

export function Sidebar(): JSX.Element {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void getAuthMe()
      .then((m) => setRole(m.role))
      .catch(() => setRole(null));
  }, []);

  const visible =
    role === undefined
      ? navItems.filter((i) => !i.adminOnly)
      : navItems.filter((item) => {
          if (item.adminOnly && role !== "ADMIN") {
            return false;
          }
          if (item.hideForViewer && role === "VIEWER") {
            return false;
          }
          return true;
        });

  return (
    <aside className="flex w-[15.5rem] shrink-0 flex-col border-r border-slate-200/90 bg-slate-50/95">
      <div className="border-b border-slate-200/80 px-4 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">GTI</p>
        <h1 className="mt-0.5 text-[15px] font-semibold leading-tight tracking-tight text-slate-900">Gestão contratual</h1>
      </div>
      <nav className="flex-1 space-y-0.5 px-2 py-3" aria-label="Navegação principal">
        {visible.map((item) => {
          const hrefStr = String(item.href);
          const active = pathname === item.href || Boolean(pathname?.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center rounded-md py-2 pl-3 pr-2 text-[13px] transition-colors ${
                active
                  ? "bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
              }`}
            >
              {active ? (
                <span
                  className="absolute left-0 top-1/2 h-[60%] w-0.5 -translate-y-1/2 rounded-full bg-slate-900"
                  aria-hidden
                />
              ) : null}
              <span className="pl-1.5">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
