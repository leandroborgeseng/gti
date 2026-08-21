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

const SIDEBAR_MARK_ASPECT = BRAND.sidebarMarkWidth / BRAND.sidebarMarkHeight;

function sidebarMarkSize(variant: Variant): { width: number; height: number; className: string } {
  // Altura fixa; largura proporcional ao asset original (não esticar/cortar).
  const height = variant === "sidebar-collapsed" ? 36 : variant === "mobile" ? 40 : 44;
  const width = Math.round(height * SIDEBAR_MARK_ASPECT);
  return {
    width,
    height,
    className: cn("shrink-0 object-contain object-center", variant === "sidebar-collapsed" && "mx-auto")
  };
}

/**
 * Marca institucional reutilizável (logo + SIGTI + nome completo).
 * Fonte única: `@/lib/brand`.
 * Barra lateral usa o logo resumido «F»; login mantém o asset completo.
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
  const useSidebarMark = !isLogin;
  const markSize = useSidebarMark ? sidebarMarkSize(variant) : null;

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
      {useSidebarMark && markSize ? (
        <Image
          src={BRAND.sidebarMarkSrc}
          alt={BRAND.sidebarMarkAlt}
          width={markSize.width}
          height={markSize.height}
          priority={variant === "sidebar"}
          className={markSize.className}
          style={{ width: markSize.width, height: markSize.height }}
        />
      ) : (
        <Image
          src={BRAND.logoSrc}
          alt={BRAND.logoAlt}
          width={BRAND.logoWidth}
          height={BRAND.logoHeight}
          priority
          className="h-20 w-20 shrink-0 object-contain object-left sm:h-24 sm:w-24"
        />
      )}
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
