"use client";

import { Loader2 } from "lucide-react";

type Props = {
  label?: string;
  className?: string;
};

/** Indicador leve de carregamento (botões, painéis, filtros). */
export function InlineLoading({ label = "Carregando...", className }: Props): JSX.Element {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-slate-600 ${className ?? ""}`} role="status">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      <span>{label}</span>
    </span>
  );
}
