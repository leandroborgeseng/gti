"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { UserRecord } from "@/lib/api";
import { createUser, getAccessProfiles, getContracts, getOrganizations, getSuppliers } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import {
  createUserFormSchema,
  formatCpfDisplay,
  onlyDigitsCpf,
  type CreateUserFormValues
} from "@/modules/users/user-schemas";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { FormSection } from "@/components/ui/form-primitives";
import { useMemo } from "react";

type Props = {
  onSuccess?: () => void;
  onCreated?: (user: UserRecord) => void;
  submitLabel?: string;
};

function toggleId(list: string[], id: string, checked: boolean): string[] {
  if (checked) return list.includes(id) ? list : [...list, id];
  return list.filter((x) => x !== id);
}

const EXTERNAL_FUNCTION_LABELS: Record<string, string> = {
  REPRESENTANTE_LEGAL: "Representante legal",
  RESPONSAVEL_CONTRATUAL: "Responsável contratual",
  RESPONSAVEL_TECNICO: "Responsável técnico",
  USUARIO_AUXILIAR: "Usuário auxiliar"
};

export function UserForm({ onSuccess, onCreated, submitLabel = "Criar usuário" }: Props): JSX.Element {
  const qc = useQueryClient();
  const qOrganizations = useQuery({ queryKey: queryKeys.organizations, queryFn: getOrganizations });
  const qProfiles = useQuery({ queryKey: queryKeys.accessProfiles, queryFn: () => getAccessProfiles(false) });
  const qSuppliers = useQuery({ queryKey: queryKeys.suppliers, queryFn: getSuppliers });
  const qContracts = useQuery({ queryKey: ["contracts"], queryFn: getContracts });
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

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      fullName: "",
      cpf: "",
      email: "",
      password: "",
      userKind: "INTERNAL",
      profileIds: [],
      organizationIds: [],
      allOrganizations: false,
      supplierId: "",
      authorizedContractIds: []
    }
  });

  const allOrganizations = form.watch("allOrganizations");
  const userKind = form.watch("userKind");
  const supplierId = form.watch("supplierId");

  const supplierContracts = useMemo(() => {
    const supplier = (qSuppliers.data ?? []).find((s) => s.id === supplierId);
    if (!supplier) return [];
    const cnpjDigits = supplier.cnpj.replace(/\D/g, "");
    return (qContracts.data ?? []).filter(
      (c) => c.supplierId === supplier.id || (c.cnpj ?? "").replace(/\D/g, "") === cnpjDigits
    );
  }, [qContracts.data, qSuppliers.data, supplierId]);

  const mutation = useMutation({
    mutationFn: (values: CreateUserFormValues) => {
      if (values.userKind === "EXTERNAL") {
        return createUser({
          email: values.email.trim().toLowerCase(),
          password: values.password,
          fullName: values.fullName.trim(),
          cpf: values.cpf,
          userKind: "EXTERNAL",
          supplierId: values.supplierId,
          externalFunction: values.externalFunction,
          authorizedContractIds: values.authorizedContractIds
        });
      }
      return createUser({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        fullName: values.fullName.trim(),
        cpf: values.cpf,
        userKind: "INTERNAL",
        profileIds: values.profileIds,
        organizationIds: values.allOrganizations ? values.organizationIds : values.organizationIds,
        allOrganizations: values.allOrganizations,
        defaultProfileId: values.profileIds[0],
        defaultOrganizationId: values.allOrganizations ? null : values.organizationIds[0] ?? null
      });
    },
    onSuccess: (created) => {
      toast.success("Usuário criado. No primeiro acesso, será obrigado a trocar a senha.");
      void qc.invalidateQueries({ queryKey: queryKeys.users });
      form.reset({
        fullName: "",
        cpf: "",
        email: "",
        password: "",
        userKind: "INTERNAL",
        profileIds: [],
        organizationIds: [],
        allOrganizations: false,
        supplierId: "",
        authorizedContractIds: []
      });
      onCreated?.(created);
      onSuccess?.();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao criar usuário");
    }
  });

  return (
    <Form {...form}>
      <form
        className="space-y-6"
        onSubmit={form.handleSubmit((values) => {
          mutation.mutate(values);
        })}
      >
        <FormSection title="Tipo de conta" description="Interno (servidores) ou externo (empresa contratada).">
          <FormField
            control={form.control}
            name="userKind"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Tipo</FormLabel>
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
        </FormSection>

        <FormSection title="Identificação" description="Nome completo e CPF conforme cadastro da Administração.">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Nome completo</FormLabel>
                <FormControl>
                  <Input placeholder="Nome e sobrenome" autoComplete="name" {...field} />
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
        </FormSection>

        {userKind === "EXTERNAL" ? (
          <FormSection
            title="Empresa e contratos"
            description="Fornecedor (CNPJ) obrigatório, função e contratos autorizados do mesmo fornecedor."
          >
            <FormField
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
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
                <FormItem className="sm:col-span-2">
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
                <FormItem className="sm:col-span-2">
                  <FormLabel>Contratos autorizados</FormLabel>
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
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
          </FormSection>
        ) : (
          <FormSection
            title="Perfis e órgãos"
            description="Obrigatório ao menos um perfil e (um órgão ou abrangência «Todos os órgãos»)."
          >
            <FormField
              control={form.control}
              name="profileIds"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Perfis de acesso</FormLabel>
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                    {activeProfiles.map((p) => {
                      const checked = field.value.includes(p.id);
                      return (
                        <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => field.onChange(toggleId(field.value, p.id, v === true))}
                          />
                          <span>
                            {p.name}
                            {p.systemKey ? (
                              <span className="text-muted-foreground"> · {p.systemKey}</span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="allOrganizations"
              render={({ field }) => (
                <FormItem className="sm:col-span-2 flex flex-row items-center gap-2 space-y-0">
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
                <FormItem className="sm:col-span-2">
                  <FormLabel>{allOrganizations ? "Órgãos vinculados (opcional)" : "Órgãos"}</FormLabel>
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                    {activeOrganizations.map((org) => {
                      const checked = field.value.includes(org.id);
                      return (
                        <label key={org.id} className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => field.onChange(toggleId(field.value, org.id, v === true))}
                          />
                          <span>{org.acronym ? `${org.acronym} · ${org.name}` : org.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <FormDescription>
                    {allOrganizations
                      ? "Com «Todos os órgãos», o usuário pode escolher visão global ou um órgão específico no seletor de contexto."
                      : "Selecione um ou mais órgãos de atuação."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>
        )}

        <FormSection
          title="Credenciais"
          description="E-mail único no sistema. Senha inicial com pelo menos 8 caracteres; o usuário deverá trocá-la no primeiro acesso."
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>E-mail</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="nome@empresa.com.br" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Senha inicial</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <Button type="submit" disabled={mutation.isPending || qOrganizations.isPending || qProfiles.isPending}>
          {mutation.isPending ? "Salvando…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
