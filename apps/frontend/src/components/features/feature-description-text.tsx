"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const DEFAULT_LIMIT = 500;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({ text, query }: { text: string; query: string }): JSX.Element {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={`${part}-${index}`} className="rounded bg-amber-100 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

type Props = {
  text: string;
  /** Pesquisa ativa: expandir automaticamente se o termo estiver após o limite. */
  searchQuery?: string;
  limit?: number;
  className?: string;
};

/**
 * Exibe descrição de funcionalidade com limite visual e “Mostrar mais/menos”.
 * Não altera o texto armazenado — apenas a apresentação.
 */
export function FeatureDescriptionText({
  text,
  searchQuery = "",
  limit = DEFAULT_LIMIT,
  className
}: Props): JSX.Element {
  const [manualExpanded, setManualExpanded] = useState(false);
  const q = searchQuery.trim();
  const needsTruncate = text.length > limit;

  const matchBeyondLimit = useMemo(() => {
    if (!q || !needsTruncate) return false;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    return idx >= limit;
  }, [text, q, limit, needsTruncate]);

  const expanded = manualExpanded || matchBeyondLimit;
  const visible = !needsTruncate || expanded ? text : `${text.slice(0, limit).trimEnd()}…`;

  return (
    <div className={cn("min-w-0", className)}>
      <p className="whitespace-pre-wrap text-sm font-normal leading-relaxed text-foreground">
        <HighlightedText text={visible} query={q} />
      </p>
      {needsTruncate ? (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => setManualExpanded((v) => !v)}
        >
          {expanded ? "Mostrar menos" : "Mostrar mais"}
        </button>
      ) : null}
    </div>
  );
}
