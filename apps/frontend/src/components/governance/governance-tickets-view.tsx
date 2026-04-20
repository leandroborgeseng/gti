"use client";

import type { Route } from "next";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { GovernanceTicket } from "@/lib/api";
import { getGovernanceTickets } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { GovernanceCreateForm } from "@/components/actions/governance-create-form";
import { GovernanceListActions } from "@/components/actions/governance-actions";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";

const statusLabel: Record<string, string> = {
  OPEN: "Aberto",
  ACKNOWLEDGED: "Ciente",
  IN_PROGRESS: "Em andamento",
  SLA_VIOLATED: "SLA violado",
  EXTENDED_DEADLINE: "Prazo estendido",
  ESCALATED: "Escalonado",
  SENT_TO_CONTROLADORIA: "Enviado à controladoria"
};

const columnHelper = createColumnHelper<GovernanceTicket>();

type ContractOption = { id: string; number: string; name: string };

type Props = {
  tickets: GovernanceTicket[];
  contractOptions?: ContractOption[];
  dataLoadErrors?: string[];
};

export function GovernanceTicketsView({ tickets: initialTickets, contractOptions, dataLoadErrors = [] }: Props): JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: tickets = initialTickets } = useQuery({
    queryKey: queryKeys.governanceTickets,
    queryFn: getGovernanceTickets,
    initialData: initialTickets
  });

  const columns = useMemo<ColumnDef<GovernanceTicket, any>[]>(
    () => [
      columnHelper.accessor("ticketId", {
        header: "Chamado GLPI",
        cell: (info) => <span className="font-medium text-foreground">#{info.getValue()}</span>
      }),
      columnHelper.accessor((row) => row.contract?.number ?? "—", {
        id: "contract",
        header: "Contrato",
        cell: (info) => <span className="whitespace-nowrap text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor("priority", {
        header: "Prioridade",
        cell: (info) => <span className="text-muted-foreground">{info.getValue() ?? "—"}</span>
      }),
      columnHelper.accessor("slaDeadline", {
        header: "Prazo SLA",
        cell: (info) => {
          const v = info.getValue();
          return (
            <span className="whitespace-nowrap text-muted-foreground">
              {v ? new Date(v as string).toLocaleString("pt-BR") : "—"}
            </span>
          );
        }
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <Badge variant="secondary" className="max-w-[200px] truncate font-normal" title={info.getValue()}>
            {statusLabel[info.getValue()] ?? info.getValue()}
          </Badge>
        )
      }),
      columnHelper.display({
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: (ctx) => (
          <div className="text-right">
            <Button variant="link" className="h-auto p-0 text-foreground" asChild>
              <Link href={`/governance/tickets/${ctx.row.original.id}` as Route}>Linha do tempo</Link>
            </Button>
          </div>
        )
      })
    ],
    []
  );

  const onMonitoringComplete = (): void => {
    void qc.invalidateQueries({ queryKey: queryKeys.governanceTickets });
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Governança de chamados (SLA)</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Chamados vinculados a contratos. <strong className="font-medium text-foreground">Novo chamado</strong> abre o cadastro; a
            linha do tempo fica no detalhe.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
          <GovernanceListActions onMonitoringComplete={onMonitoringComplete} />
          <Button type="button" className="shrink-0 gap-2" onClick={() => setModalOpen(true)}>
            <ShieldPlus className="h-4 w-4" />
            Novo chamado
          </Button>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <DataTable
          columns={columns}
          data={tickets}
          searchPlaceholder="Pesquisar GLPI, contrato, status…"
          emptyLabel='Nenhum chamado ainda. Clique em "Novo chamado" para cadastrar.'
        />
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
            void qc.invalidateQueries({ queryKey: queryKeys.governanceTickets });
          }}
        />
      </Modal>
    </div>
  );
}
