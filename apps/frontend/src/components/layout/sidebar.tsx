"use client";

import Image from "next/image";
import Link from "next/link";
import type { MainNavGroup } from "./main-nav-data";
import { MainNavAccordion } from "./main-nav-accordion";

type Props = {
  groups: MainNavGroup[];
};

export function Sidebar({ groups }: Props): JSX.Element {
  return (
    <aside className="hidden w-[15.5rem] shrink-0 flex-col border-r border-border bg-muted/40 md:flex">
      <div className="border-b border-white/15 bg-brand-blue px-3 py-4 text-white">
        <Link href="/dashboard" className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80">
          <Image
            src="/brand/bluebeaver-logo.png"
            alt="BlueBeaver"
            width={220}
            height={64}
            className="h-12 w-auto max-w-full object-contain object-left"
            priority
          />
        </Link>
        <p className="mt-2.5 text-[10px] font-medium uppercase leading-snug tracking-[0.12em] text-white/90">GTI — Gestão contratual</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Navegação principal">
        <MainNavAccordion groups={groups} />
      </nav>
    </aside>
  );
}
