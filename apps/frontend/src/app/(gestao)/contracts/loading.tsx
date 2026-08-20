import { Loader2 } from "lucide-react";

export default function ContractsLoading(): JSX.Element {
  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded-md bg-muted/70" />
        </div>
        <div className="h-10 w-36 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="overflow-hidden rounded-xl border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b px-4 py-3 last:border-0">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 flex-1 animate-pulse rounded bg-muted/70" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted/50" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
        Carregando contratos…
      </div>
    </div>
  );
}
