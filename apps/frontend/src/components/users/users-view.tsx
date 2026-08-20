"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { UserRecord } from "@/lib/api";
import {
  getAccessProfiles,
  getContracts,
  getOrganizations,
  getSuppliers,
  getUsers,
  updateUser
} from "@/lib/api";
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
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/tables/data-table";

const columnHelper = createColumnHelper<UserRecord>();

const EXTERNAL_FUNCTION_LABELS: Record<string, string> = {
  REPRESENTANTE_LEGAL: "Representante legal",
  RESPONSAVEL_CONTRATUAL: "Responsável contratual",
  RESPONSAVEL_TECNICO: "Responsável técnico",
  USUARIO_AUXILIAR: "Usuário auxiliar"
};

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
  if (user.userKind === "EXTERNAL") {
    return (
      (!user.cpfDigits && !user.cpfMasked) ||
      !user.supplierId ||
      !user.externalFunction
    );
  }
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
  const qSuppliers = useQuery({ queryKey: queryKeys.suppliers, queryFn: getSuppliers });
  const qContracts = useQuery({ queryKey: queryKeys.contracts, queryFn: getContracts, staleTime: 60_000 });
  const activeOrganizations = useMemo(
    () => (qOrganizations.data ?? []).filter((o) => o.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [qOrganizations.data]
  );
  const activeProfiles = useMemo(
    () =>
      (qProfiles.data ?? [])
        .filter((p) => p.active && p.systemKey !== "EXTERNAL")
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [qProfiles.data]
  );
  const approvalDefault: EditUserFormValues["approvalStatus"] =
    user.approvalStatus === "PENDING" || user.approvalStatus === "REJECTED" ? user.approvalStatus : "APPROVED";

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: {
      fullName: userDisplayName(user),
      cpf: user.cpfDigits ?? "",
      userKind: user.userKind === "EXTERNAL" ? "EXTERNAL" : "INTERNAL",
      profileIds: user.profiles?.filter((p) => p.systemKey !== "EXTERNAL").map((p) => p.id) ?? [],
      organizationIds: user.organizations?.map((o) => o.id) ?? (user.organizationId ? [user.organizationId] : []),
      allOrganizations: Boolean(user.allOrganizations),
      approvalStatus: approvalDefault,
      approvalRejectionReason: user.approvalRejectionReason ?? "",
      password: "",
      supplierId: user.supplierId ?? "",
      externalFunction:
        (user.externalFunction as EditUserFormValues["externalFunction"]) ?? undefined,
      authorizedContractIds: user.authorizedContractIds ?? []
    }
  });

  const allOrganizations = form.watch("allOrganizations");
  const userKind = form.watch("userKind");
  const supplierId = form.watch("supplierId");
  const approvalStatus = form.watch("approvalStatus");

  const supplierContracts = useMemo(() => {
    const supplier = (qSuppliers.data ?? []).find((s) => s.id === supplierId);
    if (!supplier) return [];
    const cnpjDigits = supplier.cnpj.replace(/\D/g, "");
    return (qContracts.data ?? []).filter(
      (c) => c.supplierId === supplier.id || (c.cnpj ?? "").replace(/\D/g, "") === cnpjDigits
    );
  }, [qContracts.data, qSuppliers.data, supplierId]);

  const mutation = useMutation({
    mutationFn: (values: EditUserFormValues) => {
      const rejectionPayload =
        values.approvalStatus === "REJECTED"
          ? { approvalRejectionReason: values.approvalRejectionReason?.trim() || null }
          : values.approvalStatus === "APPROVED"
            ? { approvalRejectionReason: null }
            : {};
      if (values.userKind === "EXTERNAL") {
        return updateUser(user.id, {
          fullName: values.fullName.trim(),
          cpf: values.cpf ? values.cpf : null,
          userKind: "EXTERNAL",
          supplierId: values.supplierId,
          externalFunction: values.externalFunction,
          authorizedContractIds: values.authorizedContractIds,
          approvalStatus: values.approvalStatus,
          ...rejectionPayload,
          ...(values.password !== "" ? { password: values.password.trim() } : {})
        });
      }
      return updateUser(user.id, {
        fullName: values.fullName.trim(),
        cpf: values.cpf ? values.cpf : null,
        userKind: "INTERNAL",
        profileIds: values.profileIds,
        organizationIds: values.organizationIds,
        allOrganizations: values.allOrganizations,
        defaultProfileId: values.profileIds[0],
        defaultOrganizationId: values.allOrganizations ? null : values.organizationIds[0] ?? null,
        approvalStatus: values.approvalStatus,
        ...rejectionPayload,
        ...(values.password !== "" ? { password: values.password.trim() } : {})
      });
    },
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
          name="userKind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de conta</FormLabel>
              <FormControl>
                <select
                  className="w-full rounded-md border px-2 py-2 text-sm"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                >
                  <option value="INTERNAL">Interno</option>
                  <option value="EXTERNAL">Externo (empresa)</option>
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
        {userKind === "EXTERNAL" ? (
          <>
            <FormField
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fornecedor</FormLabel>
                  <FormControl>
                    <select
                      className="w-full rounded-md border px-2 py-2 text-sm"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e.target.value);
                        form.setValue("authorizedContractIds", []);
                      }}
                    >
                      <option value="">Selecione…</option>
                      {(qSuppliers.data ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.cnpj}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="externalFunction"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Função</FormLabel>
                  <FormControl>
                    <select
                      className="w-full rounded-md border px-2 py-2 text-sm"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || undefined)}
                    >
                      <option value="">Selecione…</option>
                      {Object.entries(EXTERNAL_FUNCTION_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="authorizedContractIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contratos autorizados</FormLabel>
                  <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border p-3">
                    {supplierContracts.map((c) => {
                      const checked = field.value.includes(c.id);
                      return (
                        <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => field.onChange(toggleId(field.value, c.id, v === true))}
                          />
                          <span>
                            {c.internalCode ?? c.number} — {c.name}
                          </span>
                        </label>
                      );
                    })}
                    {supplierId && supplierContracts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum contrato deste fornecedor.</p>
                    ) : null}
                    {!supplierId ? (
                      <p className="text-sm text-muted-foreground">Selecione o fornecedor primeiro.</p>
                    ) : null}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : (
          <>
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
          </>
        )}
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
        {approvalStatus === "REJECTED" ? (
          <FormField
            control={form.control}
            name="approvalRejectionReason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Justificativa da recusa</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Obrigatória para registrar a decisão" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
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
  const [rejectUser, setRejectUser] = useState<UserRecord | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: users = initialUsers } = useQuery({
    queryKey: queryKeys.users,
    queryFn: getUsers,
    initialData: initialUsers
  });

  const approvalMutation = useMutation({
    mutationFn: ({
      id,
      approvalStatus,
      approvalRejectionReason
    }: {
      id: string;
      approvalStatus: "APPROVED" | "REJECTED";
      approvalRejectionReason?: string;
    }) =>
      updateUser(id, {
        approvalStatus,
        ...(approvalStatus === "REJECTED"
          ? { approvalRejectionReason: approvalRejectionReason?.trim() || null }
          : {})
      }),
    onSuccess: (_updated, variables) => {
      toast.success(
        variables.approvalStatus === "APPROVED"
          ? "Cadastro aprovado. O usuário deverá trocar a senha no primeiro acesso."
          : "Cadastro recusado. A justificativa foi registrada na auditoria."
      );
      setRejectUser(null);
      setRejectReason("");
      void qc.invalidateQueries({ queryKey: queryKeys.users });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar aprovação");
    }
  });

  const pendingUsers = useMemo(
    () => users.filter((user) => user.approvalStatus === "PENDING"),
    [users]
  );
  const pendingCount = pendingUsers.length;

  const sortedUsers = useMemo(() => {
    const rank = (s?: string | null) => (s === "PENDING" ? 0 : s === "REJECTED" ? 1 : 2);
    return [...users].sort((a, b) => {
      const d = rank(a.approvalStatus) - rank(b.approvalStatus);
      if (d !== 0) return d;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [users]);

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
                    onClick={() => {
                      setEditUser(user);
                    }}
                  >
                    <Check className="h-4 w-4" />
                    Analisar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 text-red-700 hover:text-red-700"
                    disabled={approvalMutation.isPending}
                    onClick={() => {
                      setRejectUser(user);
                      setRejectReason("");
                    }}
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

      {pendingUsers.length > 0 ? (
        <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-amber-950">Solicitações pendentes</h2>
            <p className="mt-1 text-xs text-amber-900/80">
              Revise os dados informados pelo solicitante. Perfis, órgãos adicionais e permissões são definidos na
              edição/aprovação — não pelo próprio cadastro público.
            </p>
          </div>
          <ul className="space-y-3">
            {pendingUsers.map((user) => (
              <li
                key={user.id}
                className="rounded-lg border border-amber-200/80 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold text-foreground">{userDisplayName(user) || "Sem nome"}</p>
                    <p className="text-muted-foreground">{user.email}</p>
                    <dl className="mt-2 grid gap-1 text-xs text-slate-700 sm:grid-cols-2">
                      <div>
                        <dt className="text-slate-500">CPF</dt>
                        <dd>{user.cpfMasked ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Tipo</dt>
                        <dd>{user.userKind === "EXTERNAL" ? "Externo" : "Interno"}</dd>
                      </div>
                      {user.userKind === "EXTERNAL" ? (
                        <>
                          <div>
                            <dt className="text-slate-500">Empresa</dt>
                            <dd>
                              {user.supplier
                                ? `${user.supplier.name}${user.supplier.cnpj ? ` · ${user.supplier.cnpj}` : ""}`
                                : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Função / vínculo</dt>
                            <dd>
                              {user.externalFunction
                                ? EXTERNAL_FUNCTION_LABELS[user.externalFunction] ?? user.externalFunction
                                : "—"}
                            </dd>
                          </div>
                        </>
                      ) : (
                        <div className="sm:col-span-2">
                          <dt className="text-slate-500">Órgão</dt>
                          <dd>
                            {user.organization
                              ? user.organization.acronym
                                ? `${user.organization.acronym} · ${user.organization.name}`
                                : user.organization.name
                              : user.organizationSummary ?? "—"}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-slate-500">Solicitado em</dt>
                        <dd>
                          {new Date(user.createdAt).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short"
                          })}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1"
                      disabled={approvalMutation.isPending}
                      onClick={() => setEditUser(user)}
                    >
                      <Check className="h-4 w-4" />
                      Analisar / aprovar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1 text-red-700 hover:text-red-700"
                      disabled={approvalMutation.isPending}
                      onClick={() => {
                        setRejectUser(user);
                        setRejectReason("");
                      }}
                    >
                      <X className="h-4 w-4" />
                      Recusar
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <DataTable columns={columns} data={sortedUsers} searchPlaceholder="Pesquisar por nome, e-mail, órgão…" />
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
        title={editUser?.approvalStatus === "PENDING" ? "Analisar solicitação" : "Editar usuário"}
        description={
          editUser
            ? editUser.approvalStatus === "PENDING"
              ? "Complete perfis/órgãos (interno) ou contratos autorizados (externo) e defina a situação como Aprovado."
              : editUser.email
            : undefined
        }
      >
        {editUser ? <EditUserPanel key={editUser.id} user={editUser} onClose={() => setEditUser(null)} /> : null}
      </Modal>

      <Modal
        open={Boolean(rejectUser)}
        onClose={() => {
          if (!approvalMutation.isPending) {
            setRejectUser(null);
            setRejectReason("");
          }
        }}
        title="Recusar solicitação"
        description={
          rejectUser
            ? `Informe a justificativa administrativa para recusar o acesso de ${userDisplayName(rejectUser) || rejectUser.email}. A solicitação permanece registrada.`
            : undefined
        }
      >
        {rejectUser ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="reject-reason">
                Justificativa
              </label>
              <textarea
                id="reject-reason"
                className="mt-1.5 min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motivo da recusa (obrigatório)"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={approvalMutation.isPending}
                onClick={() => {
                  setRejectUser(null);
                  setRejectReason("");
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={approvalMutation.isPending || rejectReason.trim().length < 5}
                onClick={() =>
                  approvalMutation.mutate({
                    id: rejectUser.id,
                    approvalStatus: "REJECTED",
                    approvalRejectionReason: rejectReason.trim()
                  })
                }
              >
                Confirmar recusa
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
