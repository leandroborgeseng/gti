"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { AdminContractItemType } from "@/lib/api";
import { createAdminItemType, getAdminItemTypes, updateAdminItemType } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { DataTable } from "@/components/tables/data-table";

type FormValues = {
  code: string;
  label: string;
  description: string;
  active: boolean;
};

const columnHelper = createColumnHelper<AdminContractItemType>();

function ItemTypeForm({
  initial,
  onSuccess,
  onCancel
}: {
  initial?: AdminContractItemType | null;
  onSuccess: () => void;
  onCancel: () => void;
}): JSX.Element {
  const form = useForm<FormValues>({
    defaultValues: {
      code: initial?.code ?? "",
      label: initial?.label ?? "",
      description: initial?.description ?? "",
      active: initial?.active ?? true
    }
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!values.code.trim()) throw new Error("Informe o código");
      if (!values.label.trim()) throw new Error("Informe o rótulo");
      const payload = {
        code: values.code.trim().toUpperCase(),
        label: values.label.trim(),
        description: values.description.trim() || null,
        active: values.active
      };
      return initial ? updateAdminItemType(initial.id, payload) : createAdminItemType(payload);
    },
    onSuccess: () => {
      toast.success(initial ? "Tipo de item atualizado." : "Tipo de item criado.");
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar")
  });

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Ex.: MENSALIDADE" disabled={Boolean(initial)} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rótulo</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Nome exibido no contrato" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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

export function ItemTypesAdminPanel(): JSX.Element {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminContractItemType | null>(null);

  const { data: items = [], error, isLoading } = useQuery({
    queryKey: queryKeys.adminItemTypes,
    queryFn: getAdminItemTypes
  });

  const columns = useMemo<ColumnDef<AdminContractItemType, any>[]>(
    () => [
      columnHelper.accessor("code", {
        header: "Código",
        cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>
      }),
      columnHelper.accessor("label", {
        header: "Rótulo",
        cell: (info) => <span className="font-medium">{info.getValue()}</span>
      }),
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
      {loadError ? <DataLoadAlert messages={[loadError]} title="Não foi possível carregar tipos de itens" /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Tipos padronizados de itens contratuais (mensalidade, implantação, horas, UST…).
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
          <DataTable columns={columns} data={items} searchPlaceholder="Pesquisar código ou rótulo…" />
        )}
      </section>
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? "Editar tipo de item" : "Novo tipo de item"}
      >
        <ItemTypeForm
          key={editing?.id ?? "new"}
          initial={editing}
          onCancel={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSuccess={() => {
            setModalOpen(false);
            setEditing(null);
            void qc.invalidateQueries({ queryKey: queryKeys.adminItemTypes });
          }}
        />
      </Modal>
    </div>
  );
}
