"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type GlobalLoadingContextValue = {
  show: (message?: string) => void;
  hide: () => void;
  /** Incrementa um bloqueio explícito (ex.: troca de contexto). */
  begin: (message?: string) => void;
  end: () => void;
  active: boolean;
};

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(null);

export function useGlobalLoading(): GlobalLoadingContextValue {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) {
    return {
      show: () => undefined,
      hide: () => undefined,
      begin: () => undefined,
      end: () => undefined,
      active: false
    };
  }
  return ctx;
}

type Props = PropsWithChildren<{
  /** Se true, acompanha navegação e fetches/mutations globais (sem meta.local). */
  trackNavigation?: boolean;
}>;

export function GlobalLoadingProvider({ children, trackNavigation = true }: Props): JSX.Element {
  const [manualCount, setManualCount] = useState(0);
  const [message, setMessage] = useState("Carregando...");
  const [navPending, setNavPending] = useState(false);
  const [slow, setSlow] = useState(false);
  const pathname = usePathname();
  const prevPath = useRef(pathname);
  const shownAt = useRef<number | null>(null);

  const fetching = useIsFetching({
    predicate: (q) => q.meta?.local !== true
  });
  const mutating = useIsMutating({
    predicate: (m) => m.meta?.local !== true
  });

  useEffect(() => {
    if (!trackNavigation) return;
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      setNavPending(true);
      setMessage("Carregando...");
    }
  }, [pathname, trackNavigation]);

  useEffect(() => {
    if (!navPending) return;
    if (fetching === 0) {
      const t = window.setTimeout(() => setNavPending(false), 120);
      return () => window.clearTimeout(t);
    }
  }, [navPending, fetching]);

  const autoActive = trackNavigation && (navPending || mutating > 0);
  const active = manualCount > 0 || autoActive;

  useEffect(() => {
    if (active) {
      if (shownAt.current == null) shownAt.current = Date.now();
      const t = window.setTimeout(() => setSlow(true), 4000);
      return () => window.clearTimeout(t);
    }
    shownAt.current = null;
    setSlow(false);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  const begin = useCallback((msg?: string) => {
    if (msg) setMessage(msg);
    setManualCount((c) => c + 1);
  }, []);

  const end = useCallback(() => {
    setManualCount((c) => Math.max(0, c - 1));
  }, []);

  const show = useCallback(
    (msg?: string) => {
      if (msg) setMessage(msg);
      setManualCount((c) => (c === 0 ? 1 : c));
    },
    []
  );

  const hide = useCallback(() => {
    setManualCount(0);
  }, []);

  const value = useMemo(
    () => ({ show, hide, begin, end, active }),
    [show, hide, begin, end, active]
  );

  const label = slow ? "Ainda carregando..." : message;

  return (
    <GlobalLoadingContext.Provider value={value}>
      {children}
      {active ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 backdrop-blur-[1px]"
          role="alertdialog"
          aria-busy="true"
          aria-live="polite"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div
            className={cn(
              "pointer-events-none flex flex-col items-center gap-3 rounded-2xl border border-white/20 bg-background/95 px-8 py-6 shadow-xl"
            )}
          >
            <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
            <p className="text-sm font-medium text-foreground">{label}</p>
          </div>
        </div>
      ) : null}
    </GlobalLoadingContext.Provider>
  );
}
