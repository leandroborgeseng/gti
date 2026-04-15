import { Card } from "@/components/ui/card";
import { GovernanceDetailActions } from "@/components/actions/governance-actions";
import { getGovernanceTicket } from "@/lib/api";

type PageProps = {
  params: { id: string };
};

export default async function GovernanceTicketDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const ticket = await getGovernanceTicket(params.id).catch(() => null);
  if (!ticket) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Chamado de governança não encontrado.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-lg font-semibold">Chamado de governança #{ticket.ticketId}</h3>
        <p className="mt-1 text-sm text-slate-600">
          Registre ações obrigatórias do gestor, extensão de prazo e envio para controladoria com processo SEI.
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Status: {ticket.status} | Contrato: {ticket.contract?.number ?? "-"} | Prazo SLA:{" "}
          {ticket.slaDeadline ? new Date(ticket.slaDeadline).toLocaleString("pt-BR") : "-"}
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-3 font-semibold">Ações de governança</h4>
          <GovernanceDetailActions ticketId={ticket.id} />
        </Card>

        <Card>
          <h4 className="mb-3 font-semibold">Timeline de eventos</h4>
          <ol className="space-y-3">
            {(ticket.eventLogs ?? []).map((item) => (
              <li key={item.id} className="rounded-md border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase text-slate-500">{item.type}</p>
                <p className="text-sm">{item.description}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("pt-BR")}</p>
              </li>
            ))}
            {(ticket.eventLogs ?? []).length === 0 ? <p className="text-sm text-slate-500">Nenhum evento registrado.</p> : null}
          </ol>
        </Card>
      </div>
    </div>
  );
}
