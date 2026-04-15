import { Card } from "@/components/ui/card";
import { GoalActions } from "@/components/actions/goal-actions";
import { getGoal } from "@/lib/api";

type PageProps = {
  params: { id: string };
};

export default async function GoalDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const goal = await getGoal(params.id).catch(() => null);
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
        <p className="mt-1 text-sm text-slate-600">
          Gerencie desdobramentos, progresso automático por ações e vínculos com contratos/chamados.
        </p>
        <p className="mt-3 text-sm">
          <strong>Progresso calculado:</strong> {average}%
        </p>
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
