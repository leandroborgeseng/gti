"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { MainNavItem } from "./main-nav-data";

type Props = {
  items: MainNavItem[];
  /** Chamado após clicar em um link (ex.: fechar drawer mobile). */
  onNavigate?: () => void;
  /** Dentro da sanfona: indentação e ritmo visual alinhados ao grupo. */
  nested?: boolean;
};

export function MainNavLinks({ items, onNavigate, nested = false }: Props): JSX.Element {
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
              "group relative flex items-center gap-2 rounded-md py-2 pr-2 transition-colors duration-200",
              nested ? "pl-2.5 text-[12.5px] leading-snug" : "pl-3 text-[13px]",
              active
                ? "bg-card font-medium text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-card/80 hover:text-foreground"
            )}
          >
            {active ? (
              <span
                className={cn(
                  "absolute top-1/2 h-[58%] w-0.5 -translate-y-1/2 rounded-full bg-primary",
                  nested ? "left-1" : "left-0"
                )}
                aria-hidden
              />
            ) : null}
            <Icon className={cn("h-4 w-4 shrink-0 opacity-80", nested && "h-3.5 w-3.5")} aria-hidden />
            <span className="pl-0.5">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}
