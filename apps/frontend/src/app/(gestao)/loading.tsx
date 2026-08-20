import { Loader2 } from "lucide-react";

/** Feedback imediato na navegação App Router (enquanto o RSC resolve). */
export default function GestaoLoading(): JSX.Element {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 py-16 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm font-medium">Carregando…</p>
    </div>
  );
}
