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
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type GlobalLoadingContextValue = {
  show: (message?: string) => void;
  hide: () => void;
  /** Bloqueio fullscreen explícito (ex.: troca de contexto, exclusão longa). */
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
  /**
   * Se true, mostra uma barra leve no topo ao mudar de rota (não bloqueia cliques).
   * Overlay fullscreen só via begin()/show() manual.
   */
  trackNavigation?: boolean;
}>;

/**
 * Indicador de carregamento:
 * - Navegação: barra fina no topo (não bloqueia a UI).
 * - begin/show: overlay fullscreen (operações que exigem aguardar).
 * Mutations/fetches locais NÃO disparam overlay — usem spinner no componente.
 */
export function GlobalLoadingProvider({ children, trackNavigation = true }: Props): JSX.Element {
  const [manualCount, setManualCount] = useState(0);
  const [message, setMessage] = useState("Carregando...");
  const [navPending, setNavPending] = useState(false);
  const [slow, setSlow] = useState(false);
  const pathname = usePathname();
  const prevPath = useRef(pathname);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (!trackNavigation) return;
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      setNavPending(true);
      const t = window.setTimeout(() => setNavPending(false), 450);
      return () => window.clearTimeout(t);
    }
  }, [pathname, trackNavigation]);

  const blocking = manualCount > 0;

  useEffect(() => {
    if (blocking) {
      if (shownAt.current == null) shownAt.current = Date.now();
      const t = window.setTimeout(() => setSlow(true), 4000);
      return () => window.clearTimeout(t);
    }
    shownAt.current = null;
    setSlow(false);
  }, [blocking]);

  useEffect(() => {
    if (!blocking) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [blocking]);

  const begin = useCallback((msg?: string) => {
    if (msg) setMessage(msg);
    setManualCount((c) => c + 1);
  }, []);

  const end = useCallback(() => {
    setManualCount((c) => Math.max(0, c - 1));
  }, []);

  const show = useCallback((msg?: string) => {
    if (msg) setMessage(msg);
    setManualCount((c) => (c === 0 ? 1 : c));
  }, []);

  const hide = useCallback(() => {
    setManualCount(0);
  }, []);

  const value = useMemo(
    () => ({ show, hide, begin, end, active: blocking }),
    [show, hide, begin, end, blocking]
  );

  const label = slow ? "Ainda carregando..." : message;
  const showNavBar = trackNavigation && navPending && !blocking;

  return (
    <GlobalLoadingContext.Provider value={value}>
      {children}
      {showNavBar ? (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-0.5 overflow-hidden bg-transparent"
          role="progressbar"
          aria-busy="true"
          aria-label="Carregando página"
        >
          <div className="h-full w-1/3 gti-nav-bar-indeterminate bg-primary" />
        </div>
      ) : null}
      {blocking ? (
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
