"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/contracts", label: "Contratos" },
  { href: "/measurements", label: "Medições" },
  { href: "/glosas", label: "Glosas" },
  { href: "/suppliers", label: "Fornecedores" },
  { href: "/fiscais", label: "Fiscais" },
  { href: "/reports", label: "Relatórios" }
];

export function Sidebar(): JSX.Element {
  const pathname = usePathname();
  return (
    <aside className="w-64 flex-shrink-0 border-r border-border bg-white p-4">
      <h1 className="mb-6 text-lg font-bold">Gestão Contratual</h1>
      <nav className="space-y-2">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm transition ${
                active ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
