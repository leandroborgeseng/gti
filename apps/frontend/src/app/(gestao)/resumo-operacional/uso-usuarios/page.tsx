import type { Route } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { getUserUsageReport, type UserUsageReport } from "@/lib/api";
import { safeLoad } from "@/lib/api-load";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const emptyReport: UserUsageReport = { period: { preset: "week", from: "", to: "" }, users: [] };

const presetLinks = [
  { preset: "today", label: "Hoje" },
  { preset: "week", label: "Últimos 7 dias" },
  { preset: "month", label: "Últimos 30 dias" }
];

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min`;
  return `${total}s`;
}

function eventLabel(eventType: string): string {
  if (eventType === "LOGIN") return "Login";
  if (eventType === "PAGE_VIEW") return "Acesso";
  if (eventType === "HEARTBEAT") return "Uso ativo";
  return eventType;
}

export default async function UserUsageReportPage({
  searchParams
}: {
  searchParams?: { preset?: string; from?: string; to?: string };
}): Promise<JSX.Element> {
  const preset = searchParams?.preset ?? "week";
  const { data: report, error } = await safeLoad(
    () => getUserUsageReport({ preset, from: searchParams?.from, to: searchParams?.to }),
    emptyReport
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href={"/resumo-operacional" as Route} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          ← Voltar ao resumo operacional
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Uso do sistema por usuário</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Acompanhe quem entrou no sistema, quando entrou, tempo aproximado de uso ativo e quais áreas foram acessadas.
        </p>
      </header>

      {error ? <DataLoadAlert messages={[error]} /> : null}

      <div className="flex flex-wrap gap-2">
        {presetLinks.map((item) => (
          <Link
            key={item.preset}
            href={`/resumo-operacional/uso-usuarios?preset=${item.preset}` as Route}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
              report.period.preset === item.preset
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-foreground hover:border-primary/60"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Resumo do período</h2>
            <p className="text-sm text-muted-foreground">
              {formatDateTime(report.period.from)} até {formatDateTime(report.period.to)}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{report.users.length} usuário(s) com atividade registrada.</p>
        </div>
      </Card>

      {report.users.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum uso registrado no período selecionado.
        </Card>
      ) : (
        <div className="space-y-4">
          {report.users.map((user) => (
            <Card key={user.userId ?? user.userEmail} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-foreground">{user.userEmail}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Perfil: {user.role ?? "—"} · Primeiro registro: {formatDateTime(user.firstSeenAt)} · Último registro:{" "}
                    {formatDateTime(user.lastSeenAt)}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs sm:min-w-[24rem]">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <strong className="block text-lg text-foreground">{user.loginCount}</strong>
                    logins
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <strong className="block text-lg text-foreground">{formatDuration(user.totalActiveSeconds)}</strong>
                    uso ativo
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <strong className="block text-lg text-foreground">{user.pageViewCount}</strong>
                    acessos
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Áreas mais usadas</h3>
                  <div className="mt-2 space-y-2">
                    {user.topPaths.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem páginas registradas.</p>
                    ) : (
                      user.topPaths.map((path) => (
                        <div key={path.path} className="rounded-md border bg-background px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate font-medium text-foreground">{path.pathLabel || path.path}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{formatDuration(path.activeSeconds)}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {path.count} acesso(s) · {path.path}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-foreground">Eventos recentes</h3>
                  <div className="mt-2 space-y-2">
                    {user.recentEvents.map((event, idx) => (
                      <div key={`${event.occurredAt}-${idx}`} className="rounded-md border bg-background px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-foreground">{eventLabel(event.eventType)}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.occurredAt)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {event.pathLabel || event.path || "—"}
                          {event.durationSeconds > 0 ? ` · ${formatDuration(event.durationSeconds)}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
