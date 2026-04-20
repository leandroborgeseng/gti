"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import type { Fiscal } from "@/lib/api";
import { getFiscais } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { FiscalForm } from "@/components/actions/fiscal-form";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";

const columnHelper = createColumnHelper<Fiscal>();

type Props = {
  fiscais: Fiscal[];
  dataLoadErrors?: string[];
};

export function FiscaisView({ fiscais: initialFiscais, dataLoadErrors = [] }: Props): JSX.Element {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: fiscais = initialFiscais } = useQuery({
    queryKey: queryKeys.fiscais,
    queryFn: getFiscais,
    initialData: initialFiscais
  });

  const columns = useMemo<ColumnDef<Fiscal, any>[]>(
    () => [
      columnHelper.accessor("id", {
        header: "ID",
        cell: (info) => <span className="font-mono text-xs text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor("name", {
        header: "Nome",
        cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor("email", {
        header: "E-mail",
        cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor("phone", {
        header: "Telefone",
        cell: (info) => <span className="whitespace-nowrap text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor((row) => row.contractsAsFiscal?.length ?? 0, {
        id: "asFiscal",
        header: () => <span className="flex w-full justify-end">Como fiscal</span>,
        cell: (info) => <div className="text-right tabular-nums">{info.getValue()}</div>
      }),
      columnHelper.accessor((row) => row.contractsAsManager?.length ?? 0, {
        id: "asManager",
        header: () => <span className="flex w-full justify-end">Como gestor</span>,
        cell: (info) => <div className="text-right tabular-nums">{info.getValue()}</div>
      })
    ],
    []
  );

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fiscais e gestores</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Pessoas que podem ser vinculadas a contratos como fiscal ou gestor.{" "}
            <strong className="font-medium text-foreground">Novo fiscal</strong> abre o cadastro em modal.
          </p>
        </div>
        <Button type="button" className="shrink-0 gap-2" onClick={() => setModalOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Novo fiscal
        </Button>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <DataTable
          columns={columns}
          data={fiscais}
          searchPlaceholder="Pesquisar nome, e-mail…"
          emptyLabel='Nenhum fiscal ou gestor ainda. Clique em "Novo fiscal" para cadastrar.'
        />
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo fiscal ou gestor"
        description="Dados de contacto do perfil. Depois associe ao contrato no cadastro do contrato."
      >
        <FiscalForm
          onSuccess={() => {
            setModalOpen(false);
            void qc.invalidateQueries({ queryKey: queryKeys.fiscais });
          }}
        />
      </Modal>
    </div>
  );
}
