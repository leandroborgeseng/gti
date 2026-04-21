"use client";

import type { MainNavGroup } from "./main-nav-data";
import { MainNavAccordion } from "./main-nav-accordion";

type Props = {
  groups: MainNavGroup[];
};

export function Sidebar({ groups }: Props): JSX.Element {
  return (
    <aside className="hidden w-[15.5rem] shrink-0 flex-col border-r border-border bg-muted/40 md:flex">
      <div className="border-b border-border px-4 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">GTI</p>
        <h1 className="mt-0.5 text-[15px] font-semibold leading-tight tracking-tight text-foreground">Gestão contratual</h1>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Navegação principal">
        <MainNavAccordion groups={groups} />
      </nav>
    </aside>
  );
}
