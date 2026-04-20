"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createSupplier } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { z } from "zod";
import { supplierFormSchema } from "@/modules/suppliers/supplier-schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { FormSection } from "@/components/ui/form-primitives";

type Props = {
  onSuccess?: () => void;
};

export function SupplierForm({ onSuccess }: Props): JSX.Element {
  const qc = useQueryClient();
  const form = useForm<z.input<typeof supplierFormSchema>>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: { name: "", cnpj: "" }
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof supplierFormSchema>) => createSupplier(values),
    onSuccess: () => {
      toast.success("Fornecedor cadastrado.");
      void qc.invalidateQueries({ queryKey: queryKeys.suppliers });
      form.reset({ name: "", cnpj: "" });
      onSuccess?.();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar");
    }
  });

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
        <FormSection title="Dados do fornecedor" description="Razão social e CNPJ (14 dígitos ao enviar).">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Razão social</FormLabel>
                <FormControl>
                  <Input placeholder="Nome do fornecedor" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="cnpj"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CNPJ</FormLabel>
                <FormControl>
                  <Input placeholder="Somente números ou com máscara" inputMode="numeric" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "A guardar…" : "Cadastrar fornecedor"}
        </Button>
      </form>
    </Form>
  );
}
