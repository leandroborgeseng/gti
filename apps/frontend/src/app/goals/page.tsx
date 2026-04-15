import Link from "next/link";
import { Card } from "@/components/ui/card";

const goals = [
  { id: "g1", title: "Regulamentação da Lei 14.129/2021", status: "PLANNED", progresso: 0 },
  { id: "g2", title: "Mapeamento de dados LGPD", status: "PLANNED", progresso: 15 },
  { id: "g3", title: "Melhoria do PDTIC", status: "IN_PROGRESS", progresso: 47 }
];

export default function GoalsPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-lg font-semibold">Metas e desdobramentos</h3>
        <p className="mt-1 text-sm text-slate-600">Acompanhe execução estratégica, ações vinculadas e progresso por meta.</p>
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
                <td className="px-2 py-2">{goal.status}</td>
                <td className="px-2 py-2">{goal.progresso}%</td>
                <td className="px-2 py-2">
                  <Link href={`/goals/${goal.id}`} className="text-blue-700 hover:underline">
                    Ver detalhe
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
