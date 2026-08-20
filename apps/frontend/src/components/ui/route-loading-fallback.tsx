import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label?: string;
  className?: string;
};

/** Fallback compartilhado para `loading.tsx` das rotas de gestão. */
export function RouteLoadingFallback({ label = "Carregando…", className }: Props): JSX.Element {
  return (
    <div
      className={cn(
        "flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 py-16 text-muted-foreground",
        className
      )}
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}
