"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { UserRecord } from "@/lib/api";
import { createUser, getOrganizations } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import {
  createUserFormSchema,
  formatCpfDisplay,
  onlyDigitsCpf,
  type CreateUserFormValues
} from "@/modules/users/user-schemas";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection } from "@/components/ui/form-primitives";
import { useMemo } from "react";

type Props = {
  onSuccess?: () => void;
  onCreated?: (user: UserRecord) => void;
  submitLabel?: string;
};

export function UserForm({ onSuccess, onCreated, submitLabel = "Criar usuário" }: Props): JSX.Element {
  const qc = useQueryClient();
  const qOrganizations = useQuery({ queryKey: queryKeys.organizations, queryFn: getOrganizations });
  const activeOrganizations = useMemo(
    () => (qOrganizations.data ?? []).filter((o) => o.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [qOrganizations.data]
  );

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      fullName: "",
      cpf: "",
      email: "",
      password: "",
      organizationId: "",
      role: "EDITOR"
    }
  });

  const mutation = useMutation({
    mutationFn: (values: CreateUserFormValues) =>
      createUser({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        fullName: values.fullName.trim(),
        cpf: values.cpf,
        organizationId: values.organizationId,
        role: values.role
      }),
    onSuccess: (created) => {
      toast.success("Usuário criado. No primeiro acesso, será obrigado a trocar a senha.");
      void qc.invalidateQueries({ queryKey: queryKeys.users });
      form.reset({
        fullName: "",
        cpf: "",
        email: "",
        password: "",
        organizationId: "",
        role: "EDITOR"
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
        <FormSection
          title="Identificação"
          description="Nome completo, CPF e órgão conforme cadastro da Administração."
        >
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
          <FormField
            control={form.control}
            name="organizationId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Órgão</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined} disabled={qOrganizations.isPending}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={qOrganizations.isPending ? "Carregando…" : "Selecione o órgão"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {activeOrganizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.acronym ? `${org.acronym} — ${org.name}` : org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection
          title="Credenciais e papel"
          description="E-mail único no sistema. Senha inicial com pelo menos 8 caracteres; o usuário deverá trocá-la no primeiro acesso."
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>E-mail</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="nome@instituicao.gov.br" autoComplete="off" {...field} />
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
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Papel</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o papel" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="VIEWER">Leitura (VIEWER)</SelectItem>
                    <SelectItem value="EDITOR">Edição (EDITOR)</SelectItem>
                    <SelectItem value="ADMIN">Administrador (ADMIN)</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>Pode alterar mais tarde na edição do usuário.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <Button type="submit" disabled={mutation.isPending || qOrganizations.isPending}>
          {mutation.isPending ? "Salvando…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
