"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GovernanceTicket } from "@/lib/api";
import { GovernanceCreateForm } from "@/components/actions/governance-create-form";
import { GovernanceListActions } from "@/components/actions/governance-actions";
import { Modal } from "@/components/ui/modal";

const statusLabel: Record<string, string> = {
  OPEN: "Aberto",
  ACKNOWLEDGED: "Ciente",
  IN_PROGRESS: "Em andamento",
  SLA_VIOLATED: "SLA violado",
  EXTENDED_DEADLINE: "Prazo estendido",
  ESCALATED: "Escalonado",
  SENT_TO_CONTROLADORIA: "Enviado à controladoria"
};

import { buttonPrimaryClass } from "@/components/ui/form-primitives";
import { DataLoadAlert } from "@/components/ui/data-load-alert";

type ContractOption = { id: string; number: string; name: string };

type Props = {
  tickets: GovernanceTicket[];
  contractOptions?: ContractOption[];
  dataLoadErrors?: string[];
};

export function GovernanceTicketsView({ tickets, contractOptions, dataLoadErrors = [] }: Props): JSX.Element {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Governança de chamados (SLA)</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Chamados vinculados a contratos. <strong className="font-medium text-slate-700">Novo chamado</strong> abre o cadastro; a
            linha do tempo fica no detalhe.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
          <GovernanceListActions onMonitoringComplete={() => router.refresh()} />
          <button type="button" onClick={() => setModalOpen(true)} className={buttonPrimaryClass}>
            <span className="text-lg leading-none" aria-hidden>
              +
            </span>
            Novo chamado
          </button>
        </div>
      </div>

      <section className="overflow-hidden border border-slate-200/90 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-medium text-slate-700">Cadastrados</span>
          <span className="tabular-nums text-xs font-medium uppercase tracking-wide text-slate-400">
            {tickets.length} {tickets.length === 1 ? "registro" : "registros"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Chamado GLPI</th>
                <th className="px-5 py-3">Contrato</th>
                <th className="px-5 py-3">Prioridade</th>
                <th className="px-5 py-3">Prazo SLA</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="transition hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-900">#{ticket.ticketId}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">{ticket.contract?.number ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-600">{ticket.priority ?? "—"}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                    {ticket.slaDeadline ? new Date(ticket.slaDeadline).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-sm border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {statusLabel[ticket.status] ?? ticket.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/governance/tickets/${ticket.id}` as Route}
                      className="text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
                    >
                      Linha do tempo
                    </Link>
                  </td>
                </tr>
              ))}
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-sm text-slate-500">
                    Nenhum chamado ainda. Clique em &quot;Novo chamado&quot; para cadastrar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo chamado de governança"
        description="Identificador GLPI, contrato e data de abertura (opcional). O monitoramento de SLA pode ser executado na barra acima."
      >
        <GovernanceCreateForm
          contractOptions={contractOptions}
          onSuccess={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </div>
  );
}
