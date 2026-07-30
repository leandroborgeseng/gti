"use client";

import { ChevronsLeft } from "lucide-react";
import { AppBrand } from "@/components/brand/app-brand";
import type { MainNavGroup } from "./main-nav-data";
import { MainNavAccordion } from "./main-nav-accordion";

type Props = {
  groups: MainNavGroup[];
  onCollapse: () => void;
};

export function Sidebar({ groups, onCollapse }: Props): JSX.Element {
  return (
    <aside className="hidden w-[15.5rem] shrink-0 flex-col border-r border-border bg-muted/40 md:flex">
      <div className="border-b border-border bg-white px-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <AppBrand variant="sidebar" className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={onCollapse}
            className="shrink-0 rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            title="Recolher menu"
            aria-label="Recolher menu de navegação"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Navegação principal">
        <MainNavAccordion groups={groups} />
      </nav>
    </aside>
  );
}

type CollapsedProps = {
  onExpand: () => void;
};

/** Trilho estreito com o símbolo da marca quando o menu está recolhido. */
export function SidebarCollapsed({ onExpand }: CollapsedProps): JSX.Element {
  return (
    <aside className="hidden w-[4.25rem] shrink-0 flex-col border-r border-border bg-white md:flex">
      <div className="flex flex-col items-center gap-3 border-b border-border px-2 py-3">
        <AppBrand variant="sidebar-collapsed" linkHome />
        <button
          type="button"
          onClick={onExpand}
          className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          title="Abrir menu"
          aria-label="Abrir menu de navegação"
        >
          <ChevronsLeft className="h-4 w-4 rotate-180" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
