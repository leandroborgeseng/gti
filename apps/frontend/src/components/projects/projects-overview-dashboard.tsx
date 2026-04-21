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

/** Fundos suaves por cartão (claro / escuro). */
const STAT_TONE: Record<
  "projects" | "tasks" | "overdue" | "noDue",
  { card: string; label: string; value: string; desc: string }
> = {
  projects: {
    card: "border-sky-200/90 bg-gradient-to-br from-sky-50 via-white to-sky-100/70 shadow-sky-100/50 dark:border-sky-800/80 dark:from-sky-950/60 dark:via-neutral-950 dark:to-sky-950/40 dark:shadow-none",
    label: "text-sky-800/90 dark:text-sky-200/90",
    value: "text-sky-950 dark:text-sky-50",
    desc: "text-sky-900/75 dark:text-sky-200/70"
  },
  tasks: {
    card: "border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-white to-teal-100/60 shadow-emerald-100/50 dark:border-emerald-800/80 dark:from-emerald-950/55 dark:via-neutral-950 dark:to-teal-950/35 dark:shadow-none",
    label: "text-emerald-900/85 dark:text-emerald-200/85",
    value: "text-emerald-950 dark:text-emerald-50",
    desc: "text-emerald-900/75 dark:text-emerald-200/70"
  },
  overdue: {
    card: "border-rose-200/90 bg-gradient-to-br from-rose-50 via-white to-amber-50/70 shadow-rose-100/40 dark:border-rose-900/70 dark:from-rose-950/50 dark:via-neutral-950 dark:to-amber-950/25 dark:shadow-none",
    label: "text-rose-900/85 dark:text-rose-200/85",
    value: "text-rose-950 dark:text-rose-50",
    desc: "text-rose-900/75 dark:text-rose-200/70"
  },
  noDue: {
    card: "border-violet-200/90 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/65 shadow-violet-100/40 dark:border-violet-900/70 dark:from-violet-950/50 dark:via-neutral-950 dark:to-fuchsia-950/25 dark:shadow-none",
    label: "text-violet-900/85 dark:text-violet-200/85",
    value: "text-violet-950 dark:text-violet-50",
    desc: "text-violet-900/75 dark:text-violet-200/70"
  }
};

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
  href,
  tone
}: {
  title: string;
  value: string | number;
  description?: string;
  href?: string;
  tone: keyof typeof STAT_TONE;
}): JSX.Element {
  const t = STAT_TONE[tone];
  const body = (
    <Card
      className={cn(
        "flex h-full min-h-[148px] flex-col border-2 shadow-sm transition-shadow",
        t.card,
        href && "cursor-pointer hover:brightness-[1.02] hover:shadow-md dark:hover:brightness-110"
      )}
    >
      <CardHeader className="flex flex-1 flex-col space-y-1 p-4 pb-2">
        <CardDescription className={cn("text-xs font-medium uppercase tracking-wide", t.label)}>{title}</CardDescription>
        <CardTitle className={cn("text-2xl font-semibold tabular-nums", t.value)}>{value}</CardTitle>
      </CardHeader>
      <CardContent className="mt-auto flex min-h-[3.25rem] flex-col justify-end p-4 pt-0">
        {description ? (
          <p className={cn("text-pretty text-xs leading-snug", t.desc)}>{description}</p>
        ) : (
          <span className="min-h-[3.25rem]" aria-hidden />
        )}
      </CardContent>
    </Card>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="flex h-full min-h-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </Link>
    );
  }
  return <div className="flex h-full min-h-0">{body}</div>;
}

function DashboardSkeleton(): JSX.Element {
  return (
    <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="min-h-[148px] animate-pulse rounded-xl border bg-muted/40" />
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
      <div className="grid auto-rows-fr items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          tone="projects"
          title="Projetos"
          value={d.projectCount}
          description={`${d.groupCount} grupos (folhas Monday)`}
        />
        <StatCard
          tone="tasks"
          title="Tarefas (total)"
          value={d.taskCount}
          description={`${d.rootTaskCount} raiz · ${d.subTaskCount} subtarefas`}
          href="/projetos/tarefas"
        />
        <StatCard
          tone="overdue"
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
          tone="noDue"
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
