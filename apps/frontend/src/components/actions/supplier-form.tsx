"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { Supplier } from "@/lib/api";
import { createSupplier, updateSupplier } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import {
  contactsToText,
  parseContactsText,
  supplierFormSchema,
  type SupplierFormValues
} from "@/modules/suppliers/supplier-schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/ui/form-primitives";

type Props = {
  onSuccess?: () => void;
  /** Se informado, o formulário edita o fornecedor; caso contrário, cria. */
  supplier?: Supplier;
};

export function SupplierForm({ onSuccess, supplier }: Props): JSX.Element {
  const qc = useQueryClient();
  const editing = Boolean(supplier);
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      name: supplier?.name ?? "",
      cnpj: supplier?.cnpj ?? "",
      contactsText: contactsToText(supplier?.contacts)
    }
  });

  const mutation = useMutation({
    mutationFn: (values: SupplierFormValues) => {
      const contacts = parseContactsText(values.contactsText ?? "");
      if (supplier) {
        return updateSupplier(supplier.id, {
          name: values.name,
          cnpj: values.cnpj,
          contacts
        });
      }
      return createSupplier({
        name: values.name,
        cnpj: values.cnpj,
        contacts: contacts.length > 0 ? contacts : undefined
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Fornecedor atualizado." : "Fornecedor cadastrado.");
      void qc.invalidateQueries({ queryKey: queryKeys.suppliers });
      if (!editing) form.reset({ name: "", cnpj: "", contactsText: "" });
      onSuccess?.();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : editing ? "Erro ao atualizar" : "Erro ao cadastrar");
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
          <FormField
            control={form.control}
            name="contactsText"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Contatos para e-mail (opcional)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder={"email1@empresa.com\nemail2@empresa.com"}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Um e-mail por linha ou separados por vírgula. Usados no envio de notificações contratuais.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar fornecedor"}
        </Button>
      </form>
    </Form>
  );
}
