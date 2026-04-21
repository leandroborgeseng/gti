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

const MIN_SWEEP_FOR_LABEL = 0.42;
const LABEL_RADIUS = 0.56;

function tasksListHref(params: Record<string, string>): string {
  const sp = new URLSearchParams(params);
  const s = sp.toString();
  return s ? `/projetos/tarefas?${s}` : "/projetos/tarefas";
}

function formatPct(count: number, total: number): string {
  if (total <= 0) {
    return "—";
  }
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(
    (100 * count) / total
  );
}

function sliceTitle(label: string, count: number, total: number): string {
  const pct = formatPct(count, total);
  return `${label}: ${count} (${pct}%)`;
}

function ProjectDashIcon({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <svg
      className="aging-card__svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function ProjectStatusPieSvg({ breakdown }: { breakdown: ProjectsDashboardStats["statusBreakdown"] }): JSX.Element {
  const slices: { n: number; c: string; label: string }[] = STATUS_KIND_ORDER.map((kind) => ({
    n: breakdown[kind],
    c: STATUS_KIND_COLORS[kind].bg,
    label: STATUS_KIND_LABEL[kind]
  }));
  const total = slices.reduce((s, x) => s + x.n, 0);
  if (total <= 0) {
    return (
      <svg className="aging-dash__pie-svg" viewBox="-1 -1 2 2" role="img" aria-label="Sem tarefas nos projetos">
        <title>Sem tarefas nos projetos</title>
        <circle cx="0" cy="0" r="1" fill="#e2e8f0" />
      </svg>
    );
  }
  const fullIdx = slices.findIndex((x) => x.n === total);
  if (fullIdx >= 0) {
    const s = slices[fullIdx]!;
    const pctStr = `${formatPct(s.n, total)}%`;
    return (
      <svg className="aging-dash__pie-svg" viewBox="-1 -1 2 2" role="img" aria-label="Todas as tarefas num unico tipo de status">
        <circle cx="0" cy="0" r="1" fill={s.c}>
          <title>{sliceTitle(s.label, s.n, total)}</title>
        </circle>
        <text x="0" y="0" className="aging-dash__pie-label" fontSize="0.38" textAnchor="middle" dominantBaseline="middle">
          {pctStr}
        </text>
      </svg>
    );
  }
  const r = 0.98;
  type Seg = { n: number; c: string; label: string; sweep: number; mid: number; tip: string; pctStr: string };
  const segs: Seg[] = [];
  let angle = -Math.PI / 2;
  for (const { n, c, label } of slices) {
    if (n <= 0) continue;
    const sweep = (n / total) * 2 * Math.PI;
    segs.push({
      n,
      c,
      label,
      sweep,
      mid: angle + sweep / 2,
      tip: sliceTitle(label, n, total),
      pctStr: `${formatPct(n, total)}%`
    });
    angle += sweep;
  }
  const paths: JSX.Element[] = [];
  const labels: JSX.Element[] = [];
  angle = -Math.PI / 2;
  for (const seg of segs) {
    const { sweep, c, tip } = seg;
    const next = angle + sweep;
    const x1 = r * Math.cos(angle);
    const y1 = r * Math.sin(angle);
    const x2 = r * Math.cos(next);
    const y2 = r * Math.sin(next);
    const largeArc = sweep > Math.PI ? 1 : 0;
    paths.push(
      <path
        key={`${c}-${angle}`}
        d={`M 0 0 L ${x1.toFixed(4)} ${y1.toFixed(4)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(4)} ${y2.toFixed(4)} Z`}
        fill={c}
      >
        <title>{tip}</title>
      </path>
    );
    if (sweep >= MIN_SWEEP_FOR_LABEL) {
      const tx = LABEL_RADIUS * Math.cos(seg.mid);
      const ty = LABEL_RADIUS * Math.sin(seg.mid);
      labels.push(
        <text
          key={`l-${seg.mid}`}
          x={tx.toFixed(3)}
          y={ty.toFixed(3)}
          className="aging-dash__pie-label"
          fontSize="0.22"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {seg.pctStr}
        </text>
      );
    }
    angle = next;
  }
  return (
    <svg className="aging-dash__pie-svg" viewBox="-1 -1 2 2" role="img" aria-label="Distribuicao de tarefas por tipo de status">
      {paths}
      {labels}
    </svg>
  );
}

type PrjTone = "prj-projects" | "prj-tasks" | "prj-overdue" | "prj-nodue";

function ProjectMetricCard({
  tone,
  value,
  title,
  hint,
  icon,
  totalForPct,
  href
}: {
  tone: PrjTone;
  value: number;
  title: string;
  hint: string;
  icon: JSX.Element;
  totalForPct: number | null;
  href?: string;
}): JSX.Element {
  const pct =
    totalForPct !== null && totalForPct > 0 ? (
      <span className="aging-card__pct" title="Percentual do total de tarefas">
        {formatPct(value, totalForPct)}%
      </span>
    ) : null;
  const pctLabel = totalForPct !== null && totalForPct > 0 ? formatPct(value, totalForPct) : "—";
  const ariaLabel =
    totalForPct !== null && totalForPct > 0 ? `${title}: ${value}, ${pctLabel} por cento das tarefas` : `${title}: ${value}`;
  const inner = (
    <>
      <div className="aging-card__iconwrap">{icon}</div>
      <div className="aging-card__value-row">
        <span className="aging-card__value">{value}</span>
        {pct}
      </div>
      <h3 className="aging-card__title">{title}</h3>
      <p className="aging-card__hint">{hint}</p>
    </>
  );
  const cls = `aging-card aging-card--${tone}`;
  if (href) {
    return (
      <Link href={href} className={cls} role="listitem" aria-label={ariaLabel}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={cls} role="listitem" aria-label={ariaLabel}>
      {inner}
    </div>
  );
}

function StatusLegendLinks({ breakdown }: { breakdown: ProjectsDashboardStats["statusBreakdown"] }): JSX.Element {
  const parts: { kind: ProjectTaskStatusKind; n: number }[] = [];
  for (const kind of STATUS_KIND_ORDER) {
    const n = breakdown[kind];
    if (n > 0) parts.push({ kind, n });
  }
  if (parts.length === 0) {
    return <span className="text-[0.8rem] text-[var(--ink-muted)]">Sem tarefas para mostrar na legenda.</span>;
  }
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[0.8rem] text-[var(--ink-muted)]">
      {parts.map(({ kind, n }) => (
        <li key={kind}>
          <Link
            href={tasksListHref({ statusKind: kind })}
            className="inline-flex items-center gap-1.5 font-medium text-[var(--brand)] no-underline hover:underline"
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

function DashboardSkeleton(): JSX.Element {
  return (
    <div className="gti-exec-metric-dash" aria-busy="true" aria-label="A carregar resumo dos projetos">
      <div className="aging-dash-skel" />
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
      <section aria-label="Resumo geral dos projetos">
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
  const taskTotal = d.taskCount;
  const overdueLine =
    taskTotal > 0 && d.projectsWithOverdueCount > 0 ? (
      <span
        className="aging-dash__delayed"
        title="Projetos com pelo menos uma tarefa em atraso (data limite antes de hoje, UTC, excluindo concluídas)"
      >
        <span className="aging-dash__delayed-k">Projetos com atraso</span>{" "}
        <span className="aging-dash__delayed-v">{d.projectsWithOverdueCount}</span>
        {d.projectCount > 0 ? (
          <span className="aging-dash__delayed-p">
            {" "}
            ({formatPct(d.projectsWithOverdueCount, d.projectCount)}% dos {d.projectCount} projetos)
          </span>
        ) : null}
      </span>
    ) : null;

  return (
    <div className="gti-exec-metric-dash">
      <section className="aging-dash" aria-labelledby="projects-dash-title">
        <div className="aging-dash__intro">
          <h2 id="projects-dash-title" className="aging-dash__title">
            Resumo executivo dos projetos
          </h2>
          <div className="aging-dash__total-row">
            <p className="aging-dash__total">
              <span className="aging-dash__total-num">{taskTotal}</span>
              <span className="aging-dash__total-label"> tarefas em {d.projectCount} projetos</span>
              <span className="text-[0.8rem] font-semibold text-slate-600">· {d.groupCount} grupos (folhas Monday)</span>
              {overdueLine}
            </p>
            <div className="aging-dash__pie-wrap">
              <ProjectStatusPieSvg breakdown={d.statusBreakdown} />
            </div>
          </div>
          <p className="aging-dash__lede">
            <Link href="/projetos/tarefas">Abrir todas as tarefas com filtros</Link>
            {" · "}
            Use os cartões abaixo para saltar para atrasadas, sem data ou lista completa. A pizza reflete a mesma
            agregação por tipo de status do quadro.
          </p>
        </div>

        <div className="aging-dash__grid aging-dash__grid--cols-4" role="list">
          <ProjectMetricCard
            tone="prj-projects"
            value={d.projectCount}
            title="Projetos"
            hint={`${d.groupCount} grupos (folhas) no workspace`}
            totalForPct={null}
            icon={
              <ProjectDashIcon>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M3 10h18M8 6v-2M16 6v-2" />
              </ProjectDashIcon>
            }
          />
          <ProjectMetricCard
            tone="prj-tasks"
            value={d.taskCount}
            title="Tarefas (total)"
            hint={`${d.rootTaskCount} raiz · ${d.subTaskCount} subtarefas`}
            totalForPct={null}
            href="/projetos/tarefas"
            icon={
              <ProjectDashIcon>
                <path d="M9 11H5a2 2 0 0 0-2 2v3c0 1.1.9 2 2 2h4" />
                <path d="M15 11h4a2 2 0 0 1 2 2v3c0 1.1-.9 2-2 2h-4" />
                <path d="M12 3v14" />
                <path d="M8 7h8" />
              </ProjectDashIcon>
            }
          />
          <ProjectMetricCard
            tone="prj-overdue"
            value={d.overdueNotDoneCount}
            title="Atrasadas (não concluídas)"
            hint="Data limite anterior a hoje (UTC)"
            totalForPct={taskTotal}
            href={tasksListHref({ filter: "overdue" })}
            icon={
              <ProjectDashIcon>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </ProjectDashIcon>
            }
          />
          <ProjectMetricCard
            tone="prj-nodue"
            value={d.tasksWithoutDueDateNotDone}
            title="Sem data limite"
            hint="Não concluídas sem due date"
            totalForPct={taskTotal}
            href={tasksListHref({ filter: "no_due" })}
            icon={
              <ProjectDashIcon>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M3 10h18" />
                <path d="M8 14h.01M12 14h.01M16 14h.01" />
              </ProjectDashIcon>
            }
          />
        </div>

        <div className="mt-4 border-t border-slate-200/80 pt-3">
          <p className="m-0 mb-2 text-[0.78rem] font-semibold text-[var(--ink)]">Por tipo de status (lista filtrada)</p>
          <StatusLegendLinks breakdown={d.statusBreakdown} />
        </div>
      </section>
    </div>
  );
}
