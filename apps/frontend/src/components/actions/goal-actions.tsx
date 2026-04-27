"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { addGoalLink, createGoalAction, setManualGoalProgress } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import {
  GOAL_MANUAL_PROGRESS_DEFAULTS,
  GOAL_NEW_ACTION_DEFAULTS,
  GOAL_NEW_LINK_DEFAULTS,
  goalManualProgressSchema,
  goalNewActionSchema,
  goalNewLinkSchema,
  type GoalManualProgressValues,
  type GoalNewActionValues,
  type GoalNewLinkValues
} from "@/modules/goals/goal-actions-schemas";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/ui/form-primitives";

type Props = {
  goalId: string;
};

export function GoalActions({ goalId }: Props): JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();

  const formAction = useForm<GoalNewActionValues>({
    resolver: zodResolver(goalNewActionSchema),
    defaultValues: GOAL_NEW_ACTION_DEFAULTS
  });

  const formLink = useForm<GoalNewLinkValues>({
    resolver: zodResolver(goalNewLinkSchema),
    defaultValues: GOAL_NEW_LINK_DEFAULTS
  });

  const formManual = useForm<GoalManualProgressValues>({
    resolver: zodResolver(goalManualProgressSchema),
    defaultValues: GOAL_MANUAL_PROGRESS_DEFAULTS
  });

  const createActionMut = useMutation({
    mutationFn: (values: GoalNewActionValues) =>
      createGoalAction(goalId, {
        title: values.title.trim(),
        description: values.description.trim() || undefined,
        status: values.status,
        progress: values.progress,
        dueDate: values.dueDate.trim() || undefined,
        responsibleId: values.responsibleId.trim()
      }),
    onSuccess: () => {
      toast.success("Ação adicionada.");
      void qc.invalidateQueries({ queryKey: queryKeys.goals });
      formAction.reset(GOAL_NEW_ACTION_DEFAULTS);
      router.refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar ação.");
    }
  });

  const addLinkMut = useMutation({
    mutationFn: (values: GoalNewLinkValues) => addGoalLink(goalId, { type: values.type, referenceId: values.referenceId.trim() }),
    onSuccess: () => {
      toast.success("Vínculo adicionado.");
      void qc.invalidateQueries({ queryKey: queryKeys.goals });
      formLink.reset(GOAL_NEW_LINK_DEFAULTS);
      router.refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar vínculo.");
    }
  });

  const manualProgressMut = useMutation({
    mutationFn: (values: GoalManualProgressValues) => setManualGoalProgress(goalId, values.progress),
    onSuccess: () => {
      toast.success("Progresso manual atualizado.");
      void qc.invalidateQueries({ queryKey: queryKeys.goals });
      formManual.reset(GOAL_MANUAL_PROGRESS_DEFAULTS);
      router.refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar progresso.");
    }
  });

  const crossBusy = createActionMut.isPending || addLinkMut.isPending || manualProgressMut.isPending;

  return (
    <div className="space-y-6">
      <Form {...formAction}>
        <form className="space-y-4" onSubmit={formAction.handleSubmit((v) => createActionMut.mutate(v))}>
          <FormSection title="Nova ação" description="Tarefas associadas à meta; responsável obrigatório (ID de usuário).">
            <FormField
              control={formAction.control}
              name="title"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input placeholder="Título da ação" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={formAction.control}
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Descrição" rows={3} className="min-h-[72px] resize-y" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={formAction.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="NOT_STARTED">Não iniciada</SelectItem>
                      <SelectItem value="IN_PROGRESS">Em andamento</SelectItem>
                      <SelectItem value="COMPLETED">Concluída</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={formAction.control}
              name="progress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Progresso (%)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} inputMode="numeric" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={formAction.control}
              name="responsibleId"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Responsável (ID)</FormLabel>
                  <FormControl>
                    <Input placeholder="UUID do usuário" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={formAction.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Prazo (opcional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>
          <Button type="submit" disabled={crossBusy}>
            {createActionMut.isPending ? "Salvando…" : "Adicionar ação"}
          </Button>
        </form>
      </Form>

      <Form {...formLink}>
        <form className="space-y-4" onSubmit={formLink.handleSubmit((v) => addLinkMut.mutate(v))}>
          <FormSection title="Novo vínculo" description="Ligação a contrato ou identificador de ticket (conforme tipo).">
            <FormField
              control={formLink.control}
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
                      <SelectItem value="CONTRACT">Contrato</SelectItem>
                      <SelectItem value="TICKET">Ticket</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={formLink.control}
              name="referenceId"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>ID de referência</FormLabel>
                  <FormControl>
                    <Input placeholder="UUID ou identificador" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>
          <Button type="submit" disabled={crossBusy}>
            {addLinkMut.isPending ? "Salvando…" : "Adicionar vínculo"}
          </Button>
        </form>
      </Form>

      <Form {...formManual}>
        <form className="space-y-4" onSubmit={formManual.handleSubmit((v) => manualProgressMut.mutate(v))}>
          <FormSection title="Progresso manual" description="Sobrescreve o progresso calculado (0–100%).">
            <FormField
              control={formManual.control}
              name="progress"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Progresso (%)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} inputMode="numeric" {...field} />
                  </FormControl>
                  <FormDescription>Valor entre 0 e 100.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>
          <Button type="submit" variant="secondary" disabled={crossBusy}>
            {manualProgressMut.isPending ? "Salvando…" : "Atualizar progresso"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
