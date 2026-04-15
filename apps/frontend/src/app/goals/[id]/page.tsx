import { Card } from "@/components/ui/card";

type PageProps = {
  params: { id: string };
};

const actions = [
  { id: "a1", title: "Levantamento inicial", status: "COMPLETED", progress: 100, dueDate: "2026-04-01" },
  { id: "a2", title: "Plano de execução", status: "IN_PROGRESS", progress: 55, dueDate: "2026-04-30" },
  { id: "a3", title: "Validação final", status: "NOT_STARTED", progress: 0, dueDate: "2026-05-20" }
];

export default function GoalDetailPage({ params }: PageProps): JSX.Element {
  const average = Math.round(actions.reduce((acc, item) => acc + item.progress, 0) / actions.length);
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-lg font-semibold">Meta {params.id}</h3>
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
                <p className="text-slate-600">Prazo: {new Date(action.dueDate).toLocaleDateString("pt-BR")}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h4 className="mb-2 font-semibold">Vincular à meta</h4>
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="mb-1 block font-medium">Tipo de vínculo</span>
              <select className="w-full rounded-md border border-slate-300 px-3 py-2">
                <option>CONTRACT</option>
                <option>TICKET</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">ID de referência</span>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Ex.: contrato UUID ou ticket GLPI" />
            </label>
            <button className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white">Adicionar vínculo</button>
          </div>
        </Card>
      </div>
    </div>
  );
}
