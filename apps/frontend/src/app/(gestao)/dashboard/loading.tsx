import { Loader2 } from "lucide-react";

export default function DashboardLoading(): JSX.Element {
  return (
    <div className="space-y-4 p-1">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border bg-muted/60" />
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
        Carregando painel…
      </div>
    </div>
  );
}
