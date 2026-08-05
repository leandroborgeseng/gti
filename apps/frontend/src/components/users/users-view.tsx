"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { UserRecord } from "@/lib/api";
import { getAccessProfiles, getOrganizations, getUsers, updateUser } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import {
  editUserFormSchema,
  formatCpfDisplay,
  onlyDigitsCpf,
  type EditUserFormValues
} from "@/modules/users/user-schemas";
import { UserForm } from "@/components/actions/user-form";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/tables/data-table";

const columnHelper = createColumnHelper<UserRecord>();

type Props = {
  users: UserRecord[];
  dataLoadErrors?: string[];
  /** Oculta título e descrição quando embutido na Administração. */
  embedded?: boolean;
};

function userDisplayName(user: UserRecord): string {
  return (
    [user.firstName, user.lastName].map((part) => part?.trim()).filter(Boolean).join(" ") ||
    user.displayName?.trim() ||
    ""
  );
}

function userIsIncomplete(user: UserRecord): boolean {
  const hasOrg =
    Boolean(user.allOrganizations) ||
    Boolean(user.organizationId) ||
    (user.organizations?.length ?? 0) > 0;
  const hasProfile = (user.profiles?.length ?? 0) > 0 || Boolean(user.role);
  return (!user.cpfDigits && !user.cpfMasked) || !hasOrg || !hasProfile;
}

function toggleId(list: string[], id: string, checked: boolean): string[] {
  if (checked) return list.includes(id) ? list : [...list, id];
  return list.filter((x) => x !== id);
}

function EditUserPanel({
  user,
  onClose
}: {
  user: UserRecord;
  onClose: () => void;
}): JSX.Element {
  const qc = useQueryClient();
  const qOrganizations = useQuery({ queryKey: queryKeys.organizations, queryFn: getOrganizations });
  const qProfiles = useQuery({ queryKey: queryKeys.accessProfiles, queryFn: () => getAccessProfiles(false) });
  const activeOrganizations = useMemo(
    () => (qOrganizations.data ?? []).filter((o) => o.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [qOrganizations.data]
  );
  const activeProfiles = useMemo(
    () => (qProfiles.data ?? []).filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [qProfiles.data]
  );
  const approvalDefault: EditUserFormValues["approvalStatus"] =
    user.approvalStatus === "PENDING" || user.approvalStatus === "REJECTED" ? user.approvalStatus : "APPROVED";

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: {
      fullName: userDisplayName(user),
      cpf: user.cpfDigits ?? "",
      profileIds: user.profiles?.map((p) => p.id) ?? [],
      organizationIds: user.organizations?.map((o) => o.id) ?? (user.organizationId ? [user.organizationId] : []),
      allOrganizations: Boolean(user.allOrganizations),
      approvalStatus: approvalDefault,
      password: ""
    }
  });

  const allOrganizations = form.watch("allOrganizations");

  const mutation = useMutation({
    mutationFn: (values: EditUserFormValues) =>
      updateUser(user.id, {
        fullName: values.fullName.trim(),
        cpf: values.cpf ? values.cpf : null,
        profileIds: values.profileIds,
        organizationIds: values.organizationIds,
        allOrganizations: values.allOrganizations,
        defaultProfileId: values.profileIds[0],
        defaultOrganizationId: values.allOrganizations ? null : values.organizationIds[0] ?? null,
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
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome completo</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cpf"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CPF</FormLabel>
              <FormControl>
                <Input
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  autoComplete="off"
                  value={formatCpfDisplay(field.value ?? "")}
                  onChange={(e) => field.onChange(onlyDigitsCpf(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="profileIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Perfis de acesso</FormLabel>
              <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border p-3">
                {activeProfiles.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={field.value.includes(p.id)}
                      onCheckedChange={(v) => field.onChange(toggleId(field.value, p.id, v === true))}
                    />
                    <span>
                      {p.name}
                      {p.systemKey ? <span className="text-muted-foreground"> · {p.systemKey}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="allOrganizations"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              </FormControl>
              <FormLabel className="font-normal">Todos os órgãos</FormLabel>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="organizationIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{allOrganizations ? "Órgãos vinculados (opcional)" : "Órgãos"}</FormLabel>
              <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border p-3">
                {activeOrganizations.map((org) => (
                  <label key={org.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={field.value.includes(org.id)}
                      onCheckedChange={(v) => field.onChange(toggleId(field.value, org.id, v === true))}
                    />
                    <span>{org.acronym ? `${org.acronym} · ${org.name}` : org.name}</span>
                  </label>
                ))}
              </div>
              <FormDescription>
                {allOrganizations
                  ? "Abrangência global; vínculos opcionais para atalho no seletor."
                  : "Selecione um ou mais órgãos."}
              </FormDescription>
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

export function UsersView({ users: initialUsers, dataLoadErrors = [], embedded = false }: Props): JSX.Element {
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
      columnHelper.accessor((row) => userDisplayName(row), {
        id: "displayName",
        header: "Nome",
        cell: (info) => {
          const user = info.row.original;
          const incomplete = userIsIncomplete(user);
          return (
            <span className="inline-flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: user.profileColor || "#475569" }}
                aria-hidden
              />
              <span>{info.getValue() || "Não informado"}</span>
              {incomplete ? (
                <span
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                  title="Cadastro incompleto (CPF, perfil ou órgão ausente)"
                >
                  Incompleto
                </span>
              ) : null}
            </span>
          );
        }
      }),
      columnHelper.accessor("email", {
        header: "E-mail",
        cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor((row) => row.organizationSummary ?? row.organization?.acronym ?? "-", {
        id: "organization",
        header: "Órgãos",
        cell: (info) => {
          const user = info.row.original;
          const label =
            user.organizationSummary ??
            (user.allOrganizations
              ? "Todos os órgãos"
              : user.organization
                ? user.organization.acronym
                  ? `${user.organization.acronym} · ${user.organization.name}`
                  : user.organization.name
                : "-");
          return <span className="text-muted-foreground">{label}</span>;
        }
      }),
      columnHelper.accessor((row) => row.cpfMasked ?? "-", {
        id: "cpfMasked",
        header: "CPF",
        cell: (info) => <span className="whitespace-nowrap text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor((row) => row.profileSummary ?? row.role, {
        id: "profiles",
        header: "Perfis",
        cell: (info) => {
          const user = info.row.original;
          return <span>{user.profileSummary ?? user.profiles?.[0]?.name ?? user.role}</span>;
        }
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
      {!embedded ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Usuários</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Gestão de contas, perfis, órgãos, aprovação de novos cadastros e troca obrigatória de senha no primeiro
              acesso.
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
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {pendingCount > 0 ? (
            <p className="text-sm font-medium text-amber-700">
              {pendingCount} cadastro{pendingCount === 1 ? "" : "s"} aguardando aprovação.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Gestão de contas, perfis, órgãos e aprovação de cadastros.</p>
          )}
          <Button type="button" className="shrink-0 gap-2" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Novo usuário
          </Button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <DataTable columns={columns} data={users} searchPlaceholder="Pesquisar por nome, e-mail, órgão…" />
      </section>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo usuário"
        description="Contas criadas pela administração já ficam aprovadas. No primeiro acesso, o usuário será obrigado a trocar a senha inicial."
      >
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
