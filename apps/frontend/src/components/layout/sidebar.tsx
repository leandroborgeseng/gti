"use client";

import { ChevronsLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { MainNavGroup } from "./main-nav-data";
import { MainNavAccordion } from "./main-nav-accordion";

type Props = {
  groups: MainNavGroup[];
  onCollapse: () => void;
};

export function Sidebar({ groups, onCollapse }: Props): JSX.Element {
  return (
    <aside className="hidden w-[15.5rem] shrink-0 flex-col border-r border-border bg-muted/40 md:flex">
      <div className="border-b border-white/15 bg-brand-blue px-3 py-4 text-white">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href="https://www.bluebeaver.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
            >
              <Image
                src="/brand/bluebeaver-logo.png"
                alt="BlueBeaver"
                width={220}
                height={64}
                className="h-12 w-auto max-w-full object-contain object-left"
                priority
              />
            </Link>
            <p className="mt-2.5 text-[10px] font-medium uppercase leading-snug tracking-[0.12em] text-white/90">GTI — Gestão de Operações de TI</p>
          </div>
          <button
            type="button"
            onClick={onCollapse}
            className="shrink-0 rounded-md p-1.5 text-white/90 transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
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
