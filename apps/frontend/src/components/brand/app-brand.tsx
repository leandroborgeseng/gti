"use client";

import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

type Variant = "sidebar" | "sidebar-collapsed" | "mobile" | "login";

type Props = {
  variant?: Variant;
  className?: string;
  /** Se false, não envolve a marca num link (ex.: login). */
  linkHome?: boolean;
  onNavigate?: () => void;
};

/**
 * Marca institucional reutilizável (logo + SIGTI + nome completo).
 * Fonte única: `@/lib/brand`.
 */
export function AppBrand({
  variant = "sidebar",
  className,
  linkHome = true,
  onNavigate
}: Props): JSX.Element {
  const compact = variant === "sidebar-collapsed";
  const isLogin = variant === "login";
  const isSidebarExpanded = variant === "sidebar" || variant === "mobile";

  const mark = (
    <div
      className={cn(
        "flex min-w-0 items-center",
        compact && "flex-col justify-center gap-1",
        isSidebarExpanded && "gap-3",
        isLogin && "flex-col items-start gap-4",
        className
      )}
    >
      <Image
        src={BRAND.logoSrc}
        alt={BRAND.logoAlt}
        width={BRAND.logoWidth}
        height={BRAND.logoHeight}
        priority={variant === "login" || variant === "sidebar"}
        className={cn(
          "shrink-0 object-contain",
          compact && "h-9 w-9",
          variant === "sidebar" && "h-11 w-11",
          variant === "mobile" && "h-10 w-10",
          isLogin && "h-20 w-20 object-left sm:h-24 sm:w-24"
        )}
      />
      {isSidebarExpanded ? (
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-base font-semibold tracking-tight text-slate-900">{BRAND.shortName}</p>
          <p className="text-[11px] leading-snug text-slate-600">{BRAND.fullName}</p>
        </div>
      ) : null}
      {compact ? <span className="sr-only">{BRAND.displayTitle}</span> : null}
      {isLogin ? <span className="sr-only">{BRAND.loginTitle}</span> : null}
    </div>
  );

  if (!linkHome) {
    return mark;
  }

  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      className="block min-w-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
      title={BRAND.displayTitle}
    >
      {mark}
    </Link>
  );
}
