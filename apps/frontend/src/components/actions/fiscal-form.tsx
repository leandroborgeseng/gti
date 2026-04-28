"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { Fiscal } from "@/lib/api";
import { createFiscal, getFiscalUserOptions, updateFiscal } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { fiscalFormSchema, type FiscalFormValues } from "@/modules/fiscais/fiscal-schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { FormSection } from "@/components/ui/form-primitives";

type Props = {
  fiscal?: Fiscal | null;
  onSuccess?: () => void;
};

export function FiscalForm({ fiscal, onSuccess }: Props): JSX.Element {
  const qc = useQueryClient();
  const isEditing = Boolean(fiscal);
  const form = useForm<FiscalFormValues>({
    resolver: zodResolver(fiscalFormSchema),
    defaultValues: {
      name: fiscal?.name ?? "",
      email: fiscal?.email ?? "",
      phone: fiscal?.phone ?? "",
      userId: fiscal?.userId ?? ""
    }
  });

  const { data: userOptions = [], isLoading: usersLoading } = useQuery({
    queryKey: ["gestao", "fiscais", "user-options"],
    queryFn: getFiscalUserOptions
  });

  const mutation = useMutation({
    mutationFn: (values: FiscalFormValues) => (fiscal ? updateFiscal(fiscal.id, values) : createFiscal(values)),
    onSuccess: () => {
      toast.success(isEditing ? "Fiscal ou gestor atualizado." : "Fiscal cadastrado.");
      void qc.invalidateQueries({ queryKey: queryKeys.fiscais });
      if (!isEditing) {
        form.reset({ name: "", email: "", phone: "", userId: "" });
      }
      onSuccess?.();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : isEditing ? "Erro ao atualizar" : "Erro ao cadastrar");
    }
  });

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
        <FormSection title="Dados do fiscal ou gestor" description="Nome, e-mail e telefone de contato.">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input placeholder="Nome completo" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="email@org.br" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Telefone</FormLabel>
                <FormControl>
                  <Input placeholder="Telefone" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="userId"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Usuário vinculado (opcional)</FormLabel>
                <FormControl>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                    disabled={usersLoading || mutation.isPending}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  >
                    <option value="">Sem usuário vinculado</option>
                    {userOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.email} · {user.role}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Use quando o fiscal ou gestor também tiver conta de acesso no sistema.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando…" : isEditing ? "Salvar alterações" : "Cadastrar fiscal"}
        </Button>
      </form>
    </Form>
  );
}
