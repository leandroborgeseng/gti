"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createGovernanceTicket } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { governanceCreateFormSchema, type GovernanceCreateFormValues } from "@/modules/governance/governance-ticket-form-schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection } from "@/components/ui/form-primitives";

type ContractOption = { id: string; number: string; name: string };

type Props = {
  onSuccess?: () => void;
  contractOptions?: ContractOption[];
};

export function GovernanceCreateForm({ onSuccess, contractOptions }: Props): JSX.Element {
  const qc = useQueryClient();
  const hasContracts = Boolean(contractOptions && contractOptions.length > 0);

  const form = useForm<GovernanceCreateFormValues>({
    resolver: zodResolver(governanceCreateFormSchema),
    defaultValues: {
      ticketId: "",
      contractId: "",
      openedAt: ""
    }
  });

  const mutation = useMutation({
    mutationFn: (values: GovernanceCreateFormValues) =>
      createGovernanceTicket({
        ticketId: values.ticketId.trim(),
        contractId: values.contractId.trim(),
        openedAt: values.openedAt?.trim() || undefined
      }),
    onSuccess: () => {
      toast.success("Chamado de governança criado.");
      void qc.invalidateQueries({ queryKey: queryKeys.governanceTickets });
      form.reset({ ticketId: "", contractId: "", openedAt: "" });
      onSuccess?.();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar");
    }
  });

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
        <FormSection
          title="Identificadores"
          description="O ID do chamado é o identificador no GLPI. O contrato deve existir na gestão contratual."
        >
          <FormField
            control={form.control}
            name="ticketId"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>ID do chamado (GLPI)</FormLabel>
                <FormControl>
                  <Input placeholder="Ex.: número do ticket na API GLPI" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {hasContracts ? (
            <FormField
              control={form.control}
              name="contractId"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Contrato</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {contractOptions!.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.number} — {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <FormField
              control={form.control}
              name="contractId"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>ID do contrato</FormLabel>
                  <FormControl>
                    <Input placeholder="UUID do contrato" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </FormSection>

        <FormSection title="Data de abertura (opcional)" description="Se vazio, o servidor usa a data e hora atuais.">
          <FormField
            control={form.control}
            name="openedAt"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Aberto em</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "A guardar…" : "Cadastrar chamado de governança"}
        </Button>
      </form>
    </Form>
  );
}
