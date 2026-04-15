import Link from "next/link";
import { Card } from "@/components/ui/card";
import { GovernanceListActions } from "@/components/actions/governance-actions";
import { getGovernanceTickets } from "@/lib/api";

const statusColor: Record<string, string> = {
  OPEN: "bg-slate-100 text-slate-700",
  ACKNOWLEDGED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-indigo-100 text-indigo-700",
  SLA_VIOLATED: "bg-red-100 text-red-700",
  EXTENDED_DEADLINE: "bg-amber-100 text-amber-700",
  ESCALATED: "bg-orange-100 text-orange-700",
  SENT_TO_CONTROLADORIA: "bg-purple-100 text-purple-700"
};

export default async function GovernanceTicketsPage(): Promise<JSX.Element> {
  const tickets = await getGovernanceTickets().catch(() => []);
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-1 text-lg font-semibold">Governança de chamados com SLA</h3>
        <p className="text-sm text-slate-600">
          Acompanhe descumprimentos, escalonamentos e encaminhamentos para controladoria sem alterar a integração já existente com o GLPI.
        </p>
        <div className="mt-3">
          <GovernanceListActions />
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="px-2 py-2">Chamado GLPI</th>
              <th className="px-2 py-2">Contrato</th>
              <th className="px-2 py-2">Prioridade</th>
              <th className="px-2 py-2">Prazo SLA</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="border-b">
                <td className="px-2 py-2 font-medium">#{ticket.ticketId}</td>
                <td className="px-2 py-2">{ticket.contract?.number ?? "-"}</td>
                <td className="px-2 py-2">{ticket.priority ?? "-"}</td>
                <td className="px-2 py-2">{ticket.slaDeadline ? new Date(ticket.slaDeadline).toLocaleString("pt-BR") : "-"}</td>
                <td className="px-2 py-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusColor[ticket.status]}`}>{ticket.status}</span>
                </td>
                <td className="px-2 py-2">
                  <Link className="text-blue-700 hover:underline" href={`/governance/tickets/${ticket.id}`}>
                    Abrir timeline
                  </Link>
                </td>
              </tr>
            ))}
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                  Nenhum chamado de governança cadastrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
