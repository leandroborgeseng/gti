"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { createMeasurement } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { measurementFormSchema, type MeasurementFormValues } from "@/modules/measurements/measurement-form-schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection } from "@/components/ui/form-primitives";

type ContractOption = { id: string; number: string; name: string };

type Props = {
  onSuccess?: () => void;
  contractOptions?: ContractOption[];
  defaultContractId?: string;
};

export function MeasurementForm({ onSuccess, contractOptions, defaultContractId }: Props): JSX.Element {
  const qc = useQueryClient();
  const hasSelect = Boolean(contractOptions && contractOptions.length > 0);
  const [defaults] = useState(() => {
    const n = new Date();
    return { month: String(n.getMonth() + 1), year: String(n.getFullYear()) };
  });

  const resolvedInitialContract = useMemo(() => {
    if (!hasSelect) return (defaultContractId ?? "").trim();
    return defaultContractId && contractOptions?.some((c) => c.id === defaultContractId) ? defaultContractId : "";
  }, [hasSelect, defaultContractId, contractOptions]);

  const form = useForm<MeasurementFormValues>({
    resolver: zodResolver(measurementFormSchema),
    defaultValues: {
      contractId: resolvedInitialContract,
      referenceMonth: defaults.month,
      referenceYear: defaults.year
    }
  });

  useEffect(() => {
    form.reset({
      contractId: resolvedInitialContract,
      referenceMonth: defaults.month,
      referenceYear: defaults.year
    });
  }, [resolvedInitialContract, defaults.month, defaults.year, form]);

  const watchedContractId = useWatch({ control: form.control, name: "contractId" });
  const contractLabel = useMemo(() => {
    if (!hasSelect || !watchedContractId) return "";
    const c = contractOptions!.find((x) => x.id === watchedContractId);
    return c ? `${c.number} — ${c.name}` : "";
  }, [hasSelect, watchedContractId, contractOptions]);

  const mutation = useMutation({
    mutationFn: (values: MeasurementFormValues) =>
      createMeasurement({
        contractId: values.contractId.trim(),
        referenceMonth: parseInt(values.referenceMonth, 10),
        referenceYear: parseInt(values.referenceYear, 10)
      }),
    onSuccess: () => {
      toast.success("Medição criada.");
      void qc.invalidateQueries({ queryKey: queryKeys.measurements });
      form.reset({
        contractId: hasSelect ? resolvedInitialContract : "",
        referenceMonth: defaults.month,
        referenceYear: defaults.year
      });
      onSuccess?.();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao criar medição");
    }
  });

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
        <FormSection
          title="Competência e contrato"
          description="A medição é única por contrato, mês e ano. Use a competência corrente quando fizer sentido operacional."
        >
          {hasSelect ? (
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
                  {contractLabel ? <FormDescription>Selecionado: {contractLabel}</FormDescription> : null}
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
          <FormField
            control={form.control}
            name="referenceMonth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mês (1–12)</FormLabel>
                <FormControl>
                  <Input type="number" min={1} max={12} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="referenceYear"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ano</FormLabel>
                <FormControl>
                  <Input type="number" min={2000} max={2100} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando…" : "Cadastrar medição"}
        </Button>
      </form>
    </Form>
  );
}
