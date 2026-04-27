"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { UserRecord } from "@/lib/api";
import { getUsers, updateUser } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { editUserFormSchema, type EditUserFormValues } from "@/modules/users/user-schemas";
import { UserForm } from "@/components/actions/user-form";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/tables/data-table";

const roleLabel: Record<string, string> = {
  ADMIN: "Administrador",
  EDITOR: "Editor",
  VIEWER: "Leitura"
};

const columnHelper = createColumnHelper<UserRecord>();

type Props = {
  users: UserRecord[];
  dataLoadErrors?: string[];
};

function EditUserPanel({
  user,
  onClose
}: {
  user: UserRecord;
  onClose: () => void;
}): JSX.Element {
  const qc = useQueryClient();
  const roleDefault: EditUserFormValues["role"] =
    user.role === "ADMIN" || user.role === "EDITOR" || user.role === "VIEWER" ? user.role : "EDITOR";
  const approvalDefault: EditUserFormValues["approvalStatus"] =
    user.approvalStatus === "PENDING" || user.approvalStatus === "REJECTED" ? user.approvalStatus : "APPROVED";

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: {
      role: roleDefault,
      approvalStatus: approvalDefault,
      password: ""
    }
  });

  const mutation = useMutation({
    mutationFn: (values: EditUserFormValues) =>
      updateUser(user.id, {
        role: values.role,
        approvalStatus: values.approvalStatus,
        ...(values.password !== "" ? { password: values.password.trim() } : {})
      }),
    onSuccess: () => {
      toast.success("Usuário atualizado.");
      void qc.invalidateQueries({ queryKey: queryKeys.users });
      onClose();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
    }
  });

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Papel</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="VIEWER">Leitura (VIEWER)</SelectItem>
                  <SelectItem value="EDITOR">Edição (EDITOR)</SelectItem>
                  <SelectItem value="ADMIN">Administrador (ADMIN)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="approvalStatus"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status do cadastro</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="APPROVED">Aprovado</SelectItem>
                  <SelectItem value="REJECTED">Recusado</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nova senha (opcional)</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" placeholder="Deixe vazio para manter a atual" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
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

export function UsersView({ users: initialUsers, dataLoadErrors = [] }: Props): JSX.Element {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);

  const { data: users = initialUsers } = useQuery({
    queryKey: queryKeys.users,
    queryFn: getUsers,
    initialData: initialUsers
  });

  const approvalMutation = useMutation({
    mutationFn: ({ id, approvalStatus }: { id: string; approvalStatus: "APPROVED" | "REJECTED" }) =>
      updateUser(id, { approvalStatus }),
    onSuccess: (_updated, variables) => {
      toast.success(variables.approvalStatus === "APPROVED" ? "Cadastro aprovado." : "Cadastro recusado.");
      void qc.invalidateQueries({ queryKey: queryKeys.users });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar aprovação");
    }
  });

  const pendingCount = users.filter((user) => user.approvalStatus === "PENDING").length;

  const columns = useMemo<ColumnDef<UserRecord, any>[]>(
    () => [
      columnHelper.accessor("email", {
        header: "E-mail",
        cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor("role", {
        header: "Papel",
        cell: (info) => <span>{roleLabel[info.getValue()] ?? info.getValue()}</span>
      }),
      columnHelper.accessor((row) => row.approvalStatus ?? "APPROVED", {
        id: "approvalStatus",
        header: "Cadastro",
        cell: (info) => {
          const status = info.getValue();
          if (status === "PENDING") {
            return <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Pendente</span>;
          }
          if (status === "REJECTED") {
            return <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">Recusado</span>;
          }
          return <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Aprovado</span>;
        }
      }),
      columnHelper.accessor((row) => row.mustChangePassword === true, {
        id: "mustChangePassword",
        header: "Senha",
        cell: (info) =>
          info.getValue() ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Troca obrigatória</span>
          ) : (
            <span className="text-muted-foreground">Definida</span>
          )
      }),
      columnHelper.accessor("createdAt", {
        header: "Criado em",
        cell: (info) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {new Date(info.getValue()).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )
      }),
      columnHelper.display({
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: (ctx) => {
          const user = ctx.row.original;
          return (
            <div className="flex flex-wrap justify-end gap-1">
              {user.approvalStatus === "PENDING" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={approvalMutation.isPending}
                    onClick={() => approvalMutation.mutate({ id: user.id, approvalStatus: "APPROVED" })}
                  >
                    <Check className="h-4 w-4" />
                    Aprovar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 text-red-700 hover:text-red-700"
                    disabled={approvalMutation.isPending}
                    onClick={() => approvalMutation.mutate({ id: user.id, approvalStatus: "REJECTED" })}
                  >
                    <X className="h-4 w-4" />
                    Recusar
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => {
                  setEditUser(user);
                }}
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            </div>
          );
        }
      })
    ],
    [approvalMutation]
  );

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Usuários</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Gestão de contas, papéis, aprovação de novos cadastros e troca obrigatória de senha no primeiro acesso.
          </p>
          {pendingCount > 0 ? (
            <p className="mt-2 text-sm font-medium text-amber-700">
              {pendingCount} cadastro{pendingCount === 1 ? "" : "s"} aguardando aprovação.
            </p>
          ) : null}
        </div>
        <Button type="button" className="shrink-0 gap-2" onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Novo usuário
        </Button>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <DataTable columns={columns} data={users} searchPlaceholder="Pesquisar por e-mail, papel…" />
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo usuário" description="Contas criadas pela administração já ficam aprovadas. No primeiro acesso, o usuário será obrigado a trocar a senha inicial.">
        <UserForm
          onSuccess={() => {
            setCreateOpen(false);
            void qc.invalidateQueries({ queryKey: queryKeys.users });
          }}
        />
      </Modal>

      <Modal
        open={Boolean(editUser)}
        onClose={() => setEditUser(null)}
        title="Editar usuário"
        description={editUser ? editUser.email : undefined}
      >
        {editUser ? <EditUserPanel key={editUser.id} user={editUser} onClose={() => setEditUser(null)} /> : null}
      </Modal>
    </div>
  );
}
