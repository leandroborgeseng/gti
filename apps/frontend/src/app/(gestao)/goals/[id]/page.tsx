import type { Route } from "next";
import Link from "next/link";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { GoalActions } from "@/components/actions/goal-actions";
import { getGoal } from "@/lib/api";
import { safeLoadNullable } from "@/lib/api-load";

const statusLabel: Record<string, string> = {
  PLANNED: "Planejada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída"
};

type PageProps = {
  params: { id: string };
};

export default async function GoalDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const { data: goal, error } = await safeLoadNullable(() => getGoal(params.id));
  if (error) {
    return (
      <div className="gti-exec-metric-dash gti-gestao-page space-y-4">
        <DataLoadAlert messages={[error]} title="Não foi possível carregar a meta" />
        <p className="page-lead m-0">
          <Link href="/goals" className="font-semibold text-[var(--brand)] no-underline hover:underline">
            Voltar à lista de metas
          </Link>
        </p>
      </div>
    );
  }
  if (!goal) {
    return (
      <div className="gti-exec-metric-dash gti-gestao-page">
        <div className="gestao-surface-card">
          <p className="m-0 text-sm text-[var(--ink-muted)]">Meta não encontrada.</p>
        </div>
      </div>
    );
  }
  const actions = goal.actions ?? [];
  const average = goal.calculatedProgress ?? 0;
  return (
    <div className="gti-exec-metric-dash gti-gestao-page space-y-5">
      <header className="page-header">
        <p className="page-kicker">
          <Link href={"/goals" as Route}>Metas estratégicas</Link>
          <span aria-hidden> · </span>
          <span>Detalhe</span>
        </p>
        <h1 className="page-title">{goal.title}</h1>
        <p className="page-lead">
          Status <strong>{statusLabel[goal.status] ?? goal.status}</strong>, progresso agregado{" "}
          <strong className="tabular-nums">{average}%</strong>, ano <strong className="tabular-nums">{goal.year}</strong>
          . Responsável: <span className="font-mono text-sm">{goal.responsibleId}</span>.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="gestao-surface-card">
          <h2 className="m-0 text-base font-bold tracking-tight text-[var(--ink)]">Ações (desdobramentos)</h2>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Cada ação pode ter prazo e percentual próprios.</p>
          <ul className="mt-4 list-none space-y-3 p-0">
            {actions.map((action) => (
              <li
                key={action.id}
                className="rounded-[var(--radius-md)] border border-slate-200/90 bg-slate-50/80 p-3 text-sm shadow-sm"
              >
                <p className="m-0 font-semibold text-[var(--ink)]">{action.title}</p>
                <p className="mt-1 text-[var(--ink-muted)]">Status: {action.status}</p>
                <p className="mt-0.5 text-[var(--ink-muted)]">Progresso: {action.progress}%</p>
                <p className="mt-0.5 text-[var(--ink-muted)]">
                  Prazo: {action.dueDate ? new Date(action.dueDate).toLocaleDateString("pt-BR") : "—"}
                </p>
              </li>
            ))}
            {actions.length === 0 ? <p className="m-0 text-sm text-[var(--ink-muted)]">Nenhuma ação cadastrada.</p> : null}
          </ul>
        </section>

        <section className="gestao-surface-card">
          <h2 className="m-0 text-base font-bold tracking-tight text-[var(--ink)]">Ações e vínculos</h2>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Ligue a meta a contratos ou chamados e registe progresso.</p>
          <div className="mt-4">
            <GoalActions goalId={goal.id} />
          </div>
        </section>
      </div>
    </div>
  );
}
