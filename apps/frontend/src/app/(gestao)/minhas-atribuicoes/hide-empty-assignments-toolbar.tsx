"use client";

import { useEffect, useState } from "react";

const STORAGE_ACCORDION_KEY = "gti.minhas-atribuicoes.acordeao-concluidas";

export function HideEmptyAssignmentsToolbar(): JSX.Element {
  const [hideEmpty, setHideEmpty] = useState(false);

  useEffect(() => {
    const main = document.getElementById("conteudo-minhas-atribuicoes");
    if (!main) return;
    main.setAttribute("data-ocultar-vazias", hideEmpty ? "1" : "0");
  }, [hideEmpty]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
      <label className="flex cursor-pointer items-center gap-2 font-medium text-foreground">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input accent-primary"
          checked={hideEmpty}
          onChange={(e) => setHideEmpty(e.target.checked)}
        />
        Ocultar secções sem itens
      </label>
      <span className="text-xs text-muted-foreground">Útil para focar só onde há trabalho ou pendências.</span>
    </div>
  );
}

export function usePersistedCompletedAccordionOpen(): [boolean, (next: boolean | ((p: boolean) => boolean)) => void] {
  const [open, setOpenState] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_ACCORDION_KEY) === "1") {
        setOpenState(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setOpen = (next: boolean | ((p: boolean) => boolean)) => {
    setOpenState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      try {
        window.localStorage.setItem(STORAGE_ACCORDION_KEY, resolved ? "1" : "0");
      } catch {
        /* ignore */
      }
      return resolved;
    });
  };

  return [open, setOpen];
}
