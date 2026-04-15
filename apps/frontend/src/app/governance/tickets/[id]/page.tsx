import { Card } from "@/components/ui/card";

type PageProps = {
  params: { id: string };
};

const timeline = [
  { at: "2026-04-10T08:00:00Z", event: "OPENED", description: "Chamado aberto e importado do GLPI." },
  { at: "2026-04-10T09:10:00Z", event: "ACKNOWLEDGED", description: "Empresa registrou ciência." },
  { at: "2026-04-11T10:00:00Z", event: "SLA_VIOLATED", description: "SLA vencido sem resolução." },
  { at: "2026-04-11T10:05:00Z", event: "MANAGER_NOTIFIED", description: "Gestor notificado automaticamente." },
  { at: "2026-04-12T14:00:00Z", event: "DEADLINE_EXTENDED", description: "Prazo estendido com justificativa formal." }
];

export default function GovernanceTicketDetailPage({ params }: PageProps): JSX.Element {
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-lg font-semibold">Chamado de governança {params.id}</h3>
        <p className="mt-1 text-sm text-slate-600">
          Registre ações obrigatórias do gestor, extensão de prazo e envio para controladoria com processo SEI.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-3 font-semibold">Ações de governança</h4>
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="mb-1 block font-medium">Novo prazo</span>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2" type="datetime-local" />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Justificativa</span>
              <textarea className="w-full rounded-md border border-slate-300 px-3 py-2" rows={4} />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Número do processo SEI</span>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="00000.000000/2026-00" />
            </label>
            <button className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white">Salvar ação</button>
          </div>
        </Card>

        <Card>
          <h4 className="mb-3 font-semibold">Timeline de eventos</h4>
          <ol className="space-y-3">
            {timeline.map((item) => (
              <li key={`${item.at}-${item.event}`} className="rounded-md border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase text-slate-500">{item.event}</p>
                <p className="text-sm">{item.description}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(item.at).toLocaleString("pt-BR")}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
