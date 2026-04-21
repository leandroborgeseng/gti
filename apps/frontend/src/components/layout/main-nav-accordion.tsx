"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { MainNavGroup } from "./main-nav-data";
import { MainNavLinks } from "./main-nav-links";

function groupIdForPath(groups: MainNavGroup[], pathname: string | null): string | null {
  if (!pathname || groups.length === 0) {
    return groups[0]?.id ?? null;
  }
  for (const g of groups) {
    for (const item of g.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return g.id;
      }
    }
  }
  return groups[0]?.id ?? null;
}

type Props = {
  groups: MainNavGroup[];
  /** Chamado após navegar (ex.: fechar o drawer mobile). */
  onNavigate?: () => void;
};

export function MainNavAccordion({ groups, onNavigate }: Props): JSX.Element {
  const pathname = usePathname();
  const pathGroupId = useMemo(() => groupIdForPath(groups, pathname ?? null), [groups, pathname]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (pathGroupId) {
      setOpenId(pathGroupId);
    }
  }, [pathGroupId]);

  if (groups.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Sem itens de menu disponíveis.</p>;
  }

  const expandedId = openId ?? pathGroupId ?? groups[0]!.id;

  return (
    <div className="flex flex-col gap-0.5" role="presentation">
      {groups.map((group) => {
        const isOpen = expandedId === group.id;
        const panelId = `nav-grupo-${group.id}`;
        return (
          <div
            key={group.id}
            className={cn(
              "rounded-lg border border-transparent transition-[box-shadow,background-color] duration-300 ease-out",
              isOpen && "border-border/50 bg-card/30 shadow-sm"
            )}
          >
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-200",
                "hover:bg-card/70 hover:text-foreground motion-reduce:transition-none",
                isOpen && "bg-card/40 text-foreground"
              )}
              aria-expanded={isOpen}
              aria-controls={panelId}
              id={`${panelId}-trigger`}
              onClick={() => setOpenId(group.id)}
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 opacity-70 transition-transform duration-300 ease-out motion-reduce:transition-none",
                  isOpen && "rotate-180"
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1 leading-snug">{group.label}</span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={`${panelId}-trigger`}
              className={cn(
                "grid min-h-0 transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr] pointer-events-none"
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  className="ml-1.5 space-y-0.5 border-l-2 border-primary/25 pb-2.5 pl-3 pt-0.5 dark:border-primary/35"
                  {...(!isOpen ? ({ inert: true, "aria-hidden": true } as const) : { "aria-hidden": false })}
                >
                  <MainNavLinks nested items={group.items} onNavigate={onNavigate} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
