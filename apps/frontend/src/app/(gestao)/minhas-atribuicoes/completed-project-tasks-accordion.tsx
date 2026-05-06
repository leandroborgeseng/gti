"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistedCompletedAccordionOpen } from "./hide-empty-assignments-toolbar";

export function CompletedProjectTasksAccordion({
  count,
  children
}: {
  count: number;
  children: React.ReactNode;
}): JSX.Element {
  const [open, setOpen] = usePersistedCompletedAccordionOpen();
  return (
    <div className="border-t border-border pt-4 mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-muted bg-muted/25 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
        aria-label={`Concluídas, ${count} tarefa${count === 1 ? "" : "s"}. ${open ? "Recolher lista" : "Expandir lista"}.`}
      >
        <span>
          <span className="block text-sm font-semibold text-foreground">
            Concluídas ({count})
          </span>
          <span className="text-xs text-muted-foreground">{open ? "Clique para recolher" : "Clique para expandir"}</span>
        </span>
        <ChevronDown
          className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? <div className="mt-3 space-y-3">{children}</div> : null}
    </div>
  );
}
