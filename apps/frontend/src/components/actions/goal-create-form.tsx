"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { UserRecord } from "@/lib/api";
import { createGoal } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { goalCreateFormSchema, type GoalCreateFormValues } from "@/modules/goals/goal-create-form-schema";
import { UserForm } from "@/components/actions/user-form";
import { EntitySelectWithCreate } from "@/components/ui/entity-select-with-create";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/ui/form-primitives";

type Props = {
  onSuccess?: () => void;
  users?: UserRecord[];
};

export function GoalCreateForm({ onSuccess, users = [] }: Props): JSX.Element {
  const qc = useQueryClient();
  const [localUsers, setLocalUsers] = useState<UserRecord[]>(users);
  const [userModalOpen, setUserModalOpen] = useState(false);

  useEffect(() => {
    setLocalUsers(users);
  }, [users]);

  const userOptions = useMemo(
    () => localUsers.map((u) => ({ value: u.id, label: `${u.email} (${u.role})` })),
    [localUsers]
  );

  const defaultYear = String(new Date().getFullYear());

  const form = useForm<GoalCreateFormValues>({
    resolver: zodResolver(goalCreateFormSchema),
    defaultValues: {
      title: "",
      description: "",
      year: defaultYear,
      status: "PLANNED",
      priority: "",
      responsibleId: ""
    } satisfies GoalCreateFormValues
  });

  const mutation = useMutation({
    mutationFn: (values: GoalCreateFormValues) =>
      createGoal({
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
        year: parseInt(values.year, 10),
        status: values.status,
        priority: values.priority?.trim() || undefined,
        responsibleId: values.responsibleId
      }),
    onSuccess: () => {
      toast.success("Meta cadastrada.");
      void qc.invalidateQueries({ queryKey: queryKeys.goals });
      form.reset({
        title: "",
        description: "",
        year: defaultYear,
        status: "PLANNED",
        priority: "",
        responsibleId: ""
      });
      onSuccess?.();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar meta");
    }
  });

  return (
    <>
      <Form {...form}>
        <form className="space-y-6" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <FormSection title="Meta" description="Título, ano e estado inicial. O responsável deve ser um utilizador do sistema.">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input placeholder="Título da meta" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="year"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ano</FormLabel>
                  <FormControl>
                    <Input type="number" min={2020} max={2100} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
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
                      <SelectItem value="PLANNED">Planejada</SelectItem>
                      <SelectItem value="IN_PROGRESS">Em andamento</SelectItem>
                      <SelectItem value="COMPLETED">Concluída</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridade (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: Alta" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Descrição (opcional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Detalhes ou contexto" className="min-h-[72px] resize-y" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection title="Responsável" description="Quem acompanha a meta no sistema. Pode criar utilizador sem sair desta página.">
            <div className="sm:col-span-2">
              <Controller
                control={form.control}
                name="responsibleId"
                render={({ field, fieldState }) => (
                  <EntitySelectWithCreate
                    id="goal-responsible"
                    label="Utilizador responsável"
                    required
                    value={field.value}
                    onChange={field.onChange}
                    options={userOptions}
                    placeholder="Selecione…"
                    addNewLabel="+ Novo utilizador"
                    onAddNew={() => setUserModalOpen(true)}
                    error={fieldState.error?.message}
                  />
                )}
              />
            </div>
          </FormSection>

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "A guardar…" : "Cadastrar meta"}
          </Button>
        </form>
      </Form>

      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title="Novo utilizador"
        description="Após criar, o utilizador fica selecionado como responsável desta meta."
      >
        <UserForm
          onCreated={(u) => {
            setLocalUsers((prev) => [...prev.filter((x) => x.id !== u.id), u]);
            form.setValue("responsibleId", u.id, { shouldValidate: true });
            setUserModalOpen(false);
            void qc.invalidateQueries({ queryKey: queryKeys.users });
          }}
          submitLabel="Criar e usar nesta meta"
        />
      </Modal>
    </>
  );
}
