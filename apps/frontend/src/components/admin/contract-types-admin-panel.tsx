"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { ContractTypeCatalogRecord } from "@/lib/api";
import {
  createContractTypeCatalogEntry,
  getContractTypeCatalog,
  updateContractTypeCatalogEntry
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { DataTable } from "@/components/tables/data-table";

type FormValues = {
  name: string;
  acronym: string;
  description: string;
  active: boolean;
};

const columnHelper = createColumnHelper<ContractTypeCatalogRecord>();

function ContractTypeForm({
  initial,
  onSuccess,
  onCancel
}: {
  initial?: ContractTypeCatalogRecord | null;
  onSuccess: () => void;
  onCancel: () => void;
}): JSX.Element {
  const form = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? "",
      acronym: initial?.acronym ?? "",
      description: initial?.description ?? "",
      active: initial?.active ?? true
    }
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!values.name.trim()) throw new Error("Informe o nome");
      if (!values.acronym.trim()) throw new Error("Informe a sigla");
      const payload = {
        name: values.name.trim(),
        acronym: values.acronym.trim(),
        description: values.description.trim() || null,
        active: values.active
      };
      return initial ? updateContractTypeCatalogEntry(initial.id, payload) : createContractTypeCatalogEntry(payload);
    },
    onSuccess: () => {
      toast.success(initial ? "Tipo de contrato atualizado." : "Tipo de contrato criado.");
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar")
  });

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Ex.: Software" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="acronym"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sigla</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Ex.: ST" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição (opcional)</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              </FormControl>
              <FormLabel className="font-normal">Ativo</FormLabel>
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function ContractTypesAdminPanel(): JSX.Element {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ContractTypeCatalogRecord | null>(null);

  const { data: items = [], error, isLoading } = useQuery({
    queryKey: queryKeys.contractTypeCatalog,
    queryFn: getContractTypeCatalog
  });

  const columns = useMemo<ColumnDef<ContractTypeCatalogRecord, any>[]>(
    () => [
      columnHelper.accessor("name", {
        header: "Nome",
        cell: (info) => <span className="font-medium">{info.getValue()}</span>
      }),
      columnHelper.accessor("acronym", { header: "Sigla" }),
      columnHelper.accessor("description", {
        header: "Descrição",
        cell: (info) => info.getValue() ?? "—"
      }),
      columnHelper.accessor("active", {
        header: "Status",
        cell: (info) => (info.getValue() ? "Ativo" : "Inativo")
      }),
      columnHelper.display({
        id: "actions",
        header: () => <span className="flex w-full justify-end">Ações</span>,
        cell: (info) => (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditing(info.row.original);
                setModalOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
          </div>
        )
      })
    ],
    []
  );

  const loadError = error instanceof Error ? error.message : error ? String(error) : null;

  return (
    <div className="space-y-4">
      {loadError ? <DataLoadAlert messages={[loadError]} title="Não foi possível carregar tipos de contrato" /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Catálogo de tipos de contrato (Software, Datacenter, Infraestrutura, Serviço…).
        </p>
        <Button
          type="button"
          className="gap-2"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Novo tipo
        </Button>
      </div>
      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <DataTable columns={columns} data={items} searchPlaceholder="Pesquisar nome ou sigla…" />
        )}
      </section>
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? "Editar tipo de contrato" : "Novo tipo de contrato"}
      >
        <ContractTypeForm
          key={editing?.id ?? "new"}
          initial={editing}
          onCancel={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSuccess={() => {
            setModalOpen(false);
            setEditing(null);
            void qc.invalidateQueries({ queryKey: queryKeys.contractTypeCatalog });
          }}
        />
      </Modal>
    </div>
  );
}
