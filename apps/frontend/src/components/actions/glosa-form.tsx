"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createGlosa } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { glosaFormSchema, type GlosaFormValues } from "@/modules/glosas/glosa-form-schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/ui/form-primitives";

export type MeasurementOption = { id: string; label: string };

type Props = {
  onSuccess?: () => void;
  measurementOptions?: MeasurementOption[];
};

export function GlosaForm({ onSuccess, measurementOptions }: Props): JSX.Element {
  const qc = useQueryClient();
  const hasSelect = Boolean(measurementOptions && measurementOptions.length > 0);

  const form = useForm<GlosaFormValues>({
    resolver: zodResolver(glosaFormSchema),
    defaultValues: {
      measurementId: "",
      type: "ATRASO",
      value: "",
      createdBy: "",
      justification: ""
    }
  });

  const mutation = useMutation({
    mutationFn: (values: GlosaFormValues) => {
      const num = Number(String(values.value).replace(",", "."));
      return createGlosa({
        measurementId: values.measurementId.trim(),
        type: values.type,
        value: num,
        createdBy: values.createdBy?.trim() || undefined,
        justification: values.justification.trim()
      });
    },
    onSuccess: () => {
      toast.success("Glosa cadastrada.");
      void qc.invalidateQueries({ queryKey: queryKeys.glosas });
      form.reset({
        measurementId: "",
        type: "ATRASO",
        value: "",
        createdBy: "",
        justification: ""
      });
      onSuccess?.();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar glosa");
    }
  });

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
        <FormSection title="Ligação e tipo" description="A glosa associa-se a uma medição já existente. O tipo categoriza o motivo.">
          {hasSelect ? (
            <FormField
              control={form.control}
              name="measurementId"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Medição</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {measurementOptions!.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
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
              name="measurementId"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>ID da medição</FormLabel>
                  <FormControl>
                    <Input placeholder="UUID da medição" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="ATRASO">Atraso</SelectItem>
                    <SelectItem value="NAO_ENTREGA">Não entrega</SelectItem>
                    <SelectItem value="SLA">SLA</SelectItem>
                    <SelectItem value="QUALIDADE">Qualidade</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Valor e justificativa" description="O valor deve ser coerente com a medição. Quem registra pode ser indicado abaixo.">
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor (R$)</FormLabel>
                <FormControl>
                  <Input type="text" inputMode="decimal" placeholder="0,00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="createdBy"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Responsável pelo registro (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="Identificador ou nome" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="justification"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Justificativa</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Fundamento da glosa" className="min-h-[88px] resize-y" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando…" : "Salvar glosa"}
        </Button>
      </form>
    </Form>
  );
}
