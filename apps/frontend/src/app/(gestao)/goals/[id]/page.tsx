import Link from "next/link";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { GoalFinalView } from "@/components/goals/goal-final-view";
import { getGoal, getProjects, getProjectsTasksFlat } from "@/lib/api";
import { safeLoadNullable } from "@/lib/api-load";

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

  // Escopo: tarefas do projeto vinculado (quando houver); senão amostra limitada em vez de 8k globais.
  const tasksParams = {
    limit: 2000,
    sort: "project" as const,
    ...(goal.projectId ? { projectId: goal.projectId } : {})
  };
  const [projects, tasks] = await Promise.all([
    getProjects().catch(() => []),
    getProjectsTasksFlat(tasksParams).catch(() => ({
      items: [],
      total: 0,
      limit: 2000,
      offset: 0,
      truncated: false
    }))
  ]);

  return <GoalFinalView goal={goal} projects={projects} tasks={tasks.items} />;
}
