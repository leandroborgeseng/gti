"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { OrganizationRecord } from "@/lib/api";
import { createOrganization, getOrganizations, updateOrganization } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/tables/data-table";

type OrgFormValues = {
  name: string;
  acronym: string;
  code: string;
  active: boolean;
};

const columnHelper = createColumnHelper<OrganizationRecord>();

type ActiveFilter = "all" | "active" | "inactive";

function OrganizationForm({
  initial,
  onSuccess,
  onCancel
}: {
  initial?: OrganizationRecord | null;
  onSuccess: () => void;
  onCancel: () => void;
}): JSX.Element {
  const form = useForm<OrgFormValues>({
    defaultValues: {
      name: initial?.name ?? "",
      acronym: initial?.acronym ?? "",
      code: initial?.code ?? "",
      active: initial?.active ?? true
    }
  });

  const mutation = useMutation({
    mutationFn: (values: OrgFormValues) => {
      if (!values.name.trim()) throw new Error("Informe o nome");
      if (!values.acronym.trim()) throw new Error("Informe a sigla");
      const payload = {
        name: values.name.trim(),
        acronym: values.acronym.trim(),
        code: values.code.trim() || null,
        active: values.active
      };
      return initial ? updateOrganization(initial.id, payload) : createOrganization(payload);
    },
    onSuccess: () => {
      toast.success(initial ? "Órgão atualizado." : "Órgão criado.");
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar órgão")
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
                <Input {...field} placeholder="Ex.: Secretaria de Tecnologia" />
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
                  <Input {...field} placeholder="Ex.: SMTI" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Código (opcional)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Código interno" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
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

export function OrganizationsAdminPanel(): JSX.Element {
  const qc = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizationRecord | null>(null);

  const { data: organizations = [], error, isLoading } = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: getOrganizations
  });

  const filtered = useMemo(() => {
    if (activeFilter === "active") return organizations.filter((o) => o.active);
    if (activeFilter === "inactive") return organizations.filter((o) => !o.active);
    return organizations;
  }, [organizations, activeFilter]);

  const columns = useMemo<ColumnDef<OrganizationRecord, any>[]>(
    () => [
      columnHelper.accessor("name", {
        header: "Nome",
        cell: (info) => <span className="font-medium">{info.getValue()}</span>
      }),
      columnHelper.accessor("acronym", { header: "Sigla" }),
      columnHelper.accessor("code", {
        header: "Código",
        cell: (info) => info.getValue() ?? "-"
      }),
      columnHelper.accessor("active", {
        header: "Status",
        cell: (info) =>
          info.getValue() ? (
            <span className="text-emerald-700">Ativo</span>
          ) : (
            <span className="text-muted-foreground">Inativo</span>
          )
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
      {loadError ? <DataLoadAlert messages={[loadError]} title="Não foi possível carregar órgãos" /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Cadastro central de órgãos (secretarias/unidades) usados em contratos e usuários.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as ActiveFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Somente ativos</SelectItem>
              <SelectItem value="inactive">Somente inativos</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            className="gap-2"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Novo órgão
          </Button>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando órgãos…</p>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            searchPlaceholder="Pesquisar nome, sigla ou código…"
            emptyLabel="Nenhum órgão cadastrado."
          />
        )}
      </section>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? "Editar órgão" : "Novo órgão"}
        description={editing ? editing.name : "Nome e sigla são obrigatórios."}
      >
        <OrganizationForm
          key={editing?.id ?? "new"}
          initial={editing}
          onCancel={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSuccess={() => {
            setModalOpen(false);
            setEditing(null);
            void qc.invalidateQueries({ queryKey: queryKeys.organizations });
          }}
        />
      </Modal>
    </div>
  );
}
