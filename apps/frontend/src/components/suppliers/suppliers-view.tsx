"use client";

import type { Route } from "next";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Supplier } from "@/lib/api";
import { getSuppliers } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { SupplierForm } from "@/components/actions/supplier-form";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";

const columnHelper = createColumnHelper<Supplier>();

type Props = {
  suppliers: Supplier[];
  dataLoadErrors?: string[];
};

export function SuppliersView({ suppliers: initialSuppliers, dataLoadErrors = [] }: Props): JSX.Element {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: suppliers = initialSuppliers } = useQuery({
    queryKey: queryKeys.suppliers,
    queryFn: getSuppliers,
    initialData: initialSuppliers
  });

  const columns = useMemo<ColumnDef<Supplier, any>[]>(
    () => [
      columnHelper.accessor("name", {
        header: "Nome",
        cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor("cnpj", {
        header: "CNPJ",
        cell: (info) => <span className="whitespace-nowrap text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.display({
        id: "contracts",
        header: "Contratos vinculados",
        cell: (info) => {
          const contracts = info.row.original.contracts ?? [];
          if (contracts.length === 0) {
            return <span className="text-sm text-muted-foreground">Nenhum contrato vinculado</span>;
          }
          return (
            <ul className="m-0 flex max-w-[520px] list-none flex-col gap-1 p-0">
              {contracts.map((contract) => (
                <li key={contract.id}>
                  <Link
                    href={`/contracts/${contract.id}` as Route}
                    className="inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium text-primary underline-offset-2 hover:bg-primary/5 hover:underline"
                    title={`${contract.number} — ${contract.name}`}
                  >
                    <span className="shrink-0 tabular-nums">{contract.number}</span>
                    <span className="truncate">— {contract.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          );
        }
      })
    ],
    []
  );

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fornecedores</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Fornecedores cadastrados no sistema. Use <strong className="font-medium text-foreground">Novo fornecedor</strong> para incluir
            dados sem sair desta lista.
          </p>
        </div>
        <Button type="button" className="shrink-0 gap-2" onClick={() => setModalOpen(true)}>
          <PackagePlus className="h-4 w-4" />
          Novo fornecedor
        </Button>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <DataTable
          columns={columns}
          data={suppliers}
          searchPlaceholder="Pesquisar fornecedor, CNPJ…"
          emptyLabel='Nenhum fornecedor ainda. Clique em "Novo fornecedor" para cadastrar.'
        />
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo fornecedor"
        description="Nome e CNPJ são obrigatórios. O registro passa a aparecer na lista após salvar."
      >
        <SupplierForm
          onSuccess={() => {
            setModalOpen(false);
            void qc.invalidateQueries({ queryKey: queryKeys.suppliers });
          }}
        />
      </Modal>
    </div>
  );
}
