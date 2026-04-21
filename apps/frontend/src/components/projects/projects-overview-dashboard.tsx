"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { ProjectsDashboardStats } from "@/lib/api";
import { getProjectsDashboard } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import {
  STATUS_KIND_COLORS,
  STATUS_KIND_LABEL,
  STATUS_KIND_ORDER,
  type ProjectTaskStatusKind
} from "@/lib/projects-task-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function tasksListHref(params: Record<string, string>): string {
  const sp = new URLSearchParams(params);
  const s = sp.toString();
  return s ? `/projetos/tarefas?${s}` : "/projetos/tarefas";
}

function MiniStatusBar({ breakdown }: { breakdown: ProjectsDashboardStats["statusBreakdown"] }): JSX.Element {
  const total = STATUS_KIND_ORDER.reduce((s, k) => s + breakdown[k], 0);
  if (total === 0) {
    return <p className="text-xs text-muted-foreground">Sem tarefas nos projetos.</p>;
  }
  return (
    <div
      className="flex h-3 w-full overflow-hidden rounded-md bg-muted"
      role="img"
      aria-label={`Distribuição de ${total} tarefas por tipo de status`}
    >
      {STATUS_KIND_ORDER.map((kind) => {
        const n = breakdown[kind];
        if (n <= 0) return null;
        const pct = (n / total) * 100;
        return (
          <Link
            key={kind}
            href={tasksListHref({ statusKind: kind })}
            className="h-full min-w-[2px] transition-[flex-grow] duration-300 ease-out hover:brightness-110"
            style={{ flex: `${n} 1 0%`, backgroundColor: STATUS_KIND_COLORS[kind].bg }}
            title={`${STATUS_KIND_LABEL[kind]}: ${n} (${pct.toFixed(0)}%) — ver na lista`}
          />
        );
      })}
    </div>
  );
}

function Legend({ breakdown }: { breakdown: ProjectsDashboardStats["statusBreakdown"] }): JSX.Element {
  const parts: { kind: ProjectTaskStatusKind; n: number }[] = [];
  for (const kind of STATUS_KIND_ORDER) {
    const n = breakdown[kind];
    if (n > 0) parts.push({ kind, n });
  }
  if (parts.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {parts.map(({ kind, n }) => (
        <li key={kind}>
          <Link
            href={tasksListHref({ statusKind: kind })}
            className="inline-flex items-center gap-1.5 rounded-sm hover:text-foreground"
          >
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: STATUS_KIND_COLORS[kind].bg }} />
            <span>
              {n} {STATUS_KIND_LABEL[kind]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StatCard({
  title,
  value,
  description,
  href
}: {
  title: string;
  value: string | number;
  description?: string;
  href?: string;
}): JSX.Element {
  const body = (
    <Card
      className={cn(
        "shadow-sm transition-shadow",
        href && "cursor-pointer hover:border-primary/40 hover:shadow-md"
      )}
    >
      <CardHeader className="space-y-1 p-4 pb-2">
        <CardDescription className="text-xs font-medium uppercase tracking-wide">{title}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      {description ? (
        <CardContent className="p-4 pt-0">
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
      ) : null}
    </Card>
  );
  if (href) {
    return (
      <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {body}
      </Link>
    );
  }
  return body;
}

function DashboardSkeleton(): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl border bg-muted/40" />
      ))}
    </div>
  );
}

export function ProjectsOverviewDashboard(): JSX.Element {
  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.projectsDashboard,
    queryFn: getProjectsDashboard
  });

  if (isPending && !data) {
    return (
      <section aria-busy="true" aria-label="A carregar resumo dos projetos">
        <DashboardSkeleton />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error instanceof Error ? error.message : "Não foi possível carregar o resumo dos projetos."}
      </div>
    );
  }

  const d = data;

  return (
    <section className="space-y-4" aria-label="Resumo geral dos projetos">
      <p className="text-sm text-muted-foreground">
        <Link href="/projetos/tarefas" className="font-medium text-primary underline-offset-4 hover:underline">
          Abrir vista de todas as tarefas com filtros
        </Link>
        {" · "}
        Clique nos cartões ou na barra de cores para filtrar por atraso, sem data ou tipo de status.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Projetos" value={d.projectCount} description={`${d.groupCount} grupos (folhas Monday)`} />
        <StatCard
          title="Tarefas (total)"
          value={d.taskCount}
          description={`${d.rootTaskCount} raiz · ${d.subTaskCount} subtarefas`}
          href="/projetos/tarefas"
        />
        <StatCard
          title="Atrasadas (não concluídas)"
          value={d.overdueNotDoneCount}
          href={tasksListHref({ filter: "overdue" })}
          description={
            d.projectsWithOverdueCount > 0
              ? `${d.projectsWithOverdueCount} projeto(s) com pelo menos uma em atraso (antes de hoje, UTC)`
              : "Data limite anterior a hoje (UTC), excluindo feitas ou concluídas"
          }
        />
        <StatCard
          title="Sem data limite"
          value={d.tasksWithoutDueDateNotDone}
          href={tasksListHref({ filter: "no_due" })}
          description="Tarefas não concluídas sem due date"
        />
      </div>

      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Tarefas por tipo de status</CardTitle>
          <CardDescription className="text-xs">
            Mesma lógica do quadro (Feito, Em progresso, Não iniciado, Bloqueado, …). Clique numa cor ou legenda para ver na lista.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <MiniStatusBar breakdown={d.statusBreakdown} />
          <Legend breakdown={d.statusBreakdown} />
        </CardContent>
      </Card>
    </section>
  );
}
