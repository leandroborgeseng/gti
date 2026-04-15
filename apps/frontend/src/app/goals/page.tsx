import type { Route } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { GoalCreateForm } from "@/components/actions/goal-create-form";
import { getGoals } from "@/lib/api";

const statusLabel: Record<string, string> = {
  PLANNED: "Planejada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída"
};

export default async function GoalsPage(): Promise<JSX.Element> {
  const goals = await getGoals().catch(() => []);
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-lg font-semibold">Nova meta</h3>
        <p className="mb-3 mt-1 text-sm text-slate-600">Cadastro simples para acompanhamento estratégico.</p>
        <GoalCreateForm />
      </Card>
      <Card>
        <h3 className="text-lg font-semibold">Metas e desdobramentos</h3>
        <p className="mt-1 text-sm text-slate-600">Visualização resumida do andamento das metas.</p>
      </Card>

      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="px-2 py-2">Meta</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Progresso</th>
              <th className="px-2 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((goal) => (
              <tr key={goal.id} className="border-b">
                <td className="px-2 py-2 font-medium">{goal.title}</td>
                <td className="px-2 py-2">{statusLabel[goal.status] ?? goal.status}</td>
                <td className="px-2 py-2">{goal.calculatedProgress ?? 0}%</td>
                <td className="px-2 py-2">
                  <Link href={`/goals/${goal.id}` as Route} className="text-blue-700 hover:underline">
                    Ver detalhe
                  </Link>
                </td>
              </tr>
            ))}
            {goals.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-center text-slate-500">
                  Nenhuma meta encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
