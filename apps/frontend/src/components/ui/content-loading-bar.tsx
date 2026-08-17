"use client";

import { useIsFetching, useIsMutating } from "@tanstack/react-query";

/** Barra fina no topo da área de conteúdo quando há fetch/mutation em andamento. */
export function ContentLoadingBar(): JSX.Element | null {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const active = fetching + mutating > 0;
  if (!active) return null;
  return (
    <div
      className="pointer-events-none fixed left-0 right-0 z-40 h-0.5 overflow-hidden bg-slate-200/40"
      style={{ top: "var(--app-header-height, 3.75rem)" }}
      role="progressbar"
      aria-label="Carregando"
    >
      <div className="h-full w-1/3 animate-pulse bg-sky-500/90" style={{ animationDuration: "1s" }} />
    </div>
  );
}
