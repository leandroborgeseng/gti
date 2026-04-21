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

/**
 * Paleta alinhada ao Monday.com (workspace / quadro do projeto).
 * Texto: #323338 / #676879; bordas: #e6e9ef; destaques: azul #579bfc, verde #00c875, vermelho #e44258, cinza #797e93.
 */
const MONDAY_STAT: Record<
  "projects" | "tasks" | "overdue" | "noDue",
  { card: string; label: string; value: string; desc: string }
> = {
  projects: {
    card: "border-0 border-l-[4px] border-l-[#579bfc] bg-white shadow-none dark:border-l-[#579bfc] dark:bg-neutral-950",
    label: "text-[#676879] dark:text-[#a0a3b3]",
    value: "text-[#323338] dark:text-[#f6f7fb]",
    desc: "text-[#676879] dark:text-[#a0a3b3]"
  },
  tasks: {
    card: "border-0 border-l-[4px] border-l-[#00c875] bg-white shadow-none dark:border-l-[#00c875] dark:bg-neutral-950",
    label: "text-[#676879] dark:text-[#a0a3b3]",
    value: "text-[#323338] dark:text-[#f6f7fb]",
    desc: "text-[#676879] dark:text-[#a0a3b3]"
  },
  overdue: {
    card: "border-0 border-l-[4px] border-l-[#e44258] bg-white shadow-none dark:border-l-[#e44258] dark:bg-neutral-950",
    label: "text-[#676879] dark:text-[#a0a3b3]",
    value: "text-[#323338] dark:text-[#f6f7fb]",
    desc: "text-[#676879] dark:text-[#a0a3b3]"
  },
  noDue: {
    card: "border-0 border-l-[4px] border-l-[#797e93] bg-white shadow-none dark:border-l-[#797e93] dark:bg-neutral-950",
    label: "text-[#676879] dark:text-[#a0a3b3]",
    value: "text-[#323338] dark:text-[#f6f7fb]",
    desc: "text-[#676879] dark:text-[#a0a3b3]"
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
    return <p className="text-xs text-[#676879] dark:text-[#a0a3b3]">Sem tarefas nos projetos.</p>;
  }
  return (
    <div
      className="flex h-3 w-full overflow-hidden rounded-sm bg-[#e6e9ef] dark:bg-neutral-800"
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
  if (parts.length === 0) return <span className="text-xs text-[#676879] dark:text-[#a0a3b3]">—</span>;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#676879] dark:text-[#a0a3b3]">
      {parts.map(({ kind, n }) => (
        <li key={kind}>
          <Link
            href={tasksListHref({ statusKind: kind })}
            className="inline-flex items-center gap-1.5 rounded-sm hover:text-[#323338] dark:hover:text-[#f6f7fb]"
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
  tone: keyof typeof MONDAY_STAT;
}): JSX.Element {
  const t = MONDAY_STAT[tone];
  const body = (
    <Card
      className={cn(
        "flex h-full min-h-[148px] flex-col rounded-none border-0 shadow-none transition-colors",
        t.card,
        href && "cursor-pointer hover:bg-[#f6f7fb] dark:hover:bg-neutral-900/90"
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
        className="flex h-full min-h-0 min-w-0 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#579bfc] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950"
      >
        {body}
      </Link>
    );
  }
  return <div className="flex h-full min-h-0 min-w-0">{body}</div>;
}

function DashboardSkeleton(): JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg border border-[#e6e9ef] dark:border-neutral-800">
      <div className="grid auto-rows-fr grid-cols-2 divide-x divide-y divide-[#e6e9ef] bg-[#e6e9ef] dark:divide-neutral-800 dark:bg-neutral-800 lg:grid-cols-[1.15fr_1.15fr_0.85fr_0.85fr] lg:divide-y-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="min-h-[148px] animate-pulse bg-white dark:bg-neutral-950" />
        ))}
      </div>
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
      <div className="overflow-hidden rounded-lg border border-[#e6e9ef] shadow-sm dark:border-neutral-800">
        <div className="grid auto-rows-fr grid-cols-2 divide-x divide-y divide-[#e6e9ef] bg-[#e6e9ef] dark:divide-neutral-800 dark:bg-neutral-800 lg:grid-cols-[1.15fr_1.15fr_0.85fr_0.85fr] lg:divide-y-0 [&>*]:min-w-0">
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
      </div>

      <Card className="rounded-lg border-[#e6e9ef] bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base text-[#323338] dark:text-[#f6f7fb]">Tarefas por tipo de status</CardTitle>
          <CardDescription className="text-xs text-[#676879] dark:text-[#a0a3b3]">
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
