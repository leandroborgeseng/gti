import { Loader2 } from "lucide-react";

export default function AdministracaoLoading(): JSX.Element {
  return (
    <div className="space-y-4 p-1">
      <div className="h-8 w-52 animate-pulse rounded-md bg-muted" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 w-28 animate-pulse rounded-md bg-muted/80" />
        ))}
      </div>
      <div className="min-h-[320px] animate-pulse rounded-xl border bg-muted/40" />
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
        Carregando administração…
      </div>
    </div>
  );
}
