"use client";

import type { Route } from "next";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, Pencil } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Supplier } from "@/lib/api";
import { getSuppliers } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { contactsToText } from "@/modules/suppliers/supplier-schema";
import dynamic from "next/dynamic";

const SupplierForm = dynamic(
  () => import("@/components/actions/supplier-form").then((m) => ({ default: m.SupplierForm })),
  { ssr: false }
);

const columnHelper = createColumnHelper<Supplier>();

type Props = {
  suppliers: Supplier[];
  dataLoadErrors?: string[];
};

export function SuppliersView({ suppliers: initialSuppliers, dataLoadErrors = [] }: Props): JSX.Element {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

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
        id: "contacts",
        header: "Contatos",
        cell: (info) => {
          const text = contactsToText(info.row.original.contacts);
          if (!text) return <span className="text-sm text-muted-foreground">—</span>;
          const emails = text.split("\n");
          return (
            <span className="text-sm text-muted-foreground" title={emails.join(", ")}>
              {emails.length === 1 ? emails[0] : `${emails.length} e-mails`}
            </span>
          );
        }
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
                    title={`${contract.number} · ${contract.name}`}
                  >
                    <span className="shrink-0 tabular-nums">{contract.number}</span>
                    <span className="truncate">· {contract.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          );
        }
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => setEditSupplier(info.row.original)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fornecedores</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Fornecedores cadastrados no sistema. Use <strong className="font-medium text-foreground">Novo fornecedor</strong> para incluir
            dados sem sair desta lista. Contatos de e-mail entram no envio de notificações.
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
        description="Nome e CNPJ são obrigatórios. Contatos de e-mail são opcionais e usados no envio de notificações."
      >
        <SupplierForm
          onSuccess={() => {
            setModalOpen(false);
            void qc.invalidateQueries({ queryKey: queryKeys.suppliers });
          }}
        />
      </Modal>

      <Modal
        open={Boolean(editSupplier)}
        onClose={() => setEditSupplier(null)}
        title="Editar fornecedor"
        description="Atualize razão social, CNPJ e contatos de e-mail para notificações."
      >
        {editSupplier ? (
          <SupplierForm
            key={editSupplier.id}
            supplier={editSupplier}
            onSuccess={() => {
              setEditSupplier(null);
              void qc.invalidateQueries({ queryKey: queryKeys.suppliers });
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
