import Link from "next/link";
import { Card } from "@/components/ui/card";
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
      <div className="space-y-4">
        <DataLoadAlert messages={[error]} title="Não foi possível carregar a meta" />
        <p className="text-sm">
          <Link
            href="/goals"
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
          >
            Voltar à lista de metas
          </Link>
        </p>
      </div>
    );
  }
  if (!goal) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Meta não encontrada.</p>
      </Card>
    );
  }
  const actions = goal.actions ?? [];
  const average = goal.calculatedProgress ?? 0;
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-lg font-semibold">{goal.title}</h3>
        <div className="mt-2 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          <p><strong>Status:</strong> {statusLabel[goal.status] ?? goal.status}</p>
          <p><strong>Progresso:</strong> {average}%</p>
          <p><strong>Ano:</strong> {goal.year}</p>
          <p><strong>Responsável:</strong> {goal.responsibleId}</p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 font-semibold">Ações (desdobramentos)</h4>
          <ul className="space-y-2 text-sm">
            {actions.map((action) => (
              <li key={action.id} className="rounded-md border border-slate-200 p-3">
                <p className="font-medium">{action.title}</p>
                <p className="text-slate-600">Status: {action.status}</p>
                <p className="text-slate-600">Progresso: {action.progress}%</p>
                <p className="text-slate-600">Prazo: {action.dueDate ? new Date(action.dueDate).toLocaleDateString("pt-BR") : "-"}</p>
              </li>
            ))}
            {actions.length === 0 ? <p className="text-sm text-slate-500">Nenhuma ação cadastrada.</p> : null}
          </ul>
        </Card>

        <Card>
          <h4 className="mb-2 font-semibold">Ações e vínculos</h4>
          <GoalActions goalId={goal.id} />
        </Card>
      </div>
    </div>
  );
}
