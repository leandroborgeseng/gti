"use client";

import type { Route } from "next";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Contract } from "@/lib/api";
import { getContracts } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { ContractForm } from "@/components/actions/contract-form";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativo",
  EXPIRED: "Encerrado",
  SUSPENDED: "Suspenso"
};

const columnHelper = createColumnHelper<Contract>();

type Props = {
  contracts: Contract[];
  dataLoadErrors?: string[];
};

export function ContractsView({ contracts: initialContracts, dataLoadErrors = [] }: Props): JSX.Element {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: contracts = initialContracts } = useQuery({
    queryKey: queryKeys.contracts,
    queryFn: getContracts,
    initialData: initialContracts
  });

  const columns = useMemo<ColumnDef<Contract, any>[]>(
    () => [
      columnHelper.accessor("number", {
        header: "Número",
        cell: (info) => <span className="font-mono text-xs text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor("name", {
        header: "Nome",
        cell: (info) => (
          <span className="max-w-[200px] truncate font-medium text-foreground" title={info.getValue()}>
            {info.getValue()}
          </span>
        )
      }),
      columnHelper.accessor((row) => row.supplier?.name ?? row.companyName, {
        id: "supplier",
        header: "Fornecedor",
        cell: (info) => (
          <span className="max-w-[180px] truncate text-muted-foreground" title={String(info.getValue())}>
            {String(info.getValue())}
          </span>
        )
      }),
      columnHelper.accessor("managingUnit", {
        header: "Órgão gestor",
        cell: (info) => (
          <span className="max-w-[140px] truncate text-muted-foreground" title={info.getValue() ?? ""}>
            {info.getValue() ?? "—"}
          </span>
        )
      }),
      columnHelper.accessor("monthlyValue", {
        header: () => <span className="flex w-full justify-end">Valor mensal</span>,
        cell: (info) => (
          <div className="whitespace-nowrap text-right tabular-nums text-foreground">
            R${" "}
            {Number(info.getValue()).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        )
      }),
      columnHelper.accessor("endDate", {
        header: "Vigência (fim)",
        cell: (info) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {new Date(info.getValue()).toLocaleDateString("pt-BR")}
          </span>
        )
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <Badge variant="secondary" className="font-normal">
            {statusLabel[info.getValue()] ?? info.getValue()}
          </Badge>
        )
      }),
      columnHelper.accessor((row) => row._count?.amendments ?? 0, {
        id: "amendments",
        header: () => <span className="flex w-full justify-center tabular-nums">Aditivos</span>,
        cell: (info) => <div className="text-center tabular-nums text-muted-foreground">{info.getValue()}</div>
      }),
      columnHelper.display({
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: (ctx) => (
          <div className="text-right">
            <Button variant="link" className="h-auto p-0 text-foreground" asChild>
              <Link href={`/contracts/${ctx.row.original.id}` as Route}>Abrir</Link>
            </Button>
          </div>
        )
      })
    ],
    []
  );

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contratos</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Lista dos contratos cadastrados. Use <strong className="font-medium text-foreground">Novo contrato</strong> para abrir o
            cadastro sem sair desta página.
          </p>
        </div>
        <Button type="button" className="shrink-0 gap-2" onClick={() => setModalOpen(true)}>
          <FilePlus2 className="h-4 w-4" />
          Novo contrato
        </Button>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <DataTable
          columns={columns}
          data={contracts}
          searchPlaceholder="Pesquisar número, fornecedor, órgão…"
          emptyLabel='Nenhum contrato ainda. Clique em "Novo contrato" para cadastrar.'
        />
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo contrato"
        description="Preencha os campos obrigatórios. O contrato fica disponível na lista assim que for salvo."
      >
        <ContractForm
          onSuccess={() => {
            setModalOpen(false);
            void qc.invalidateQueries({ queryKey: queryKeys.contracts });
            void qc.invalidateQueries({ queryKey: queryKeys.suppliers });
            void qc.invalidateQueries({ queryKey: queryKeys.fiscais });
          }}
        />
      </Modal>
    </div>
  );
}
