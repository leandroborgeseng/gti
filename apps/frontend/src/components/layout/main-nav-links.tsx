"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { MainNavItem } from "./main-nav-data";

type Props = {
  items: MainNavItem[];
  /** Chamado após clicar num link (ex.: fechar drawer mobile). */
  onNavigate?: () => void;
};

export function MainNavLinks({ items, onNavigate }: Props): JSX.Element {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        const active = pathname === item.href || Boolean(pathname?.startsWith(`${item.href}/`));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => onNavigate?.()}
            className={cn(
              "group relative flex items-center gap-2 rounded-md py-2 pl-3 pr-2 text-[13px] transition-colors",
              active
                ? "bg-card font-medium text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-card/80 hover:text-foreground"
            )}
          >
            {active ? (
              <span
                className="absolute left-0 top-1/2 h-[60%] w-0.5 -translate-y-1/2 rounded-full bg-primary"
                aria-hidden
              />
            ) : null}
            <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            <span className="pl-0.5">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}
