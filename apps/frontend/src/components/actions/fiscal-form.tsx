"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createFiscal } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { fiscalFormSchema, type FiscalFormValues } from "@/modules/fiscais/fiscal-schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { FormSection } from "@/components/ui/form-primitives";

type Props = {
  onSuccess?: () => void;
};

export function FiscalForm({ onSuccess }: Props): JSX.Element {
  const qc = useQueryClient();
  const form = useForm<FiscalFormValues>({
    resolver: zodResolver(fiscalFormSchema),
    defaultValues: { name: "", email: "", phone: "" }
  });

  const mutation = useMutation({
    mutationFn: (values: FiscalFormValues) => createFiscal(values),
    onSuccess: () => {
      toast.success("Fiscal cadastrado.");
      void qc.invalidateQueries({ queryKey: queryKeys.fiscais });
      form.reset({ name: "", email: "", phone: "" });
      onSuccess?.();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar");
    }
  });

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
        <FormSection title="Dados do fiscal" description="Nome, e-mail e telefone de contacto.">
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
        </FormSection>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando…" : "Cadastrar fiscal"}
        </Button>
      </form>
    </Form>
  );
}
