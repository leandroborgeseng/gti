"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { UserRecord } from "@/lib/api";
import { createUser } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { createUserFormSchema, type CreateUserFormValues } from "@/modules/users/user-schemas";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection } from "@/components/ui/form-primitives";

type Props = {
  onSuccess?: () => void;
  onCreated?: (user: UserRecord) => void;
  submitLabel?: string;
};

export function UserForm({ onSuccess, onCreated, submitLabel = "Criar utilizador" }: Props): JSX.Element {
  const qc = useQueryClient();
  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: { email: "", password: "", role: "EDITOR" }
  });

  const mutation = useMutation({
    mutationFn: (values: CreateUserFormValues) =>
      createUser({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        role: values.role
      }),
    onSuccess: (created) => {
      toast.success("Utilizador criado. Se o Resend estiver configurado, o link de acesso será enviado por e-mail.");
      void qc.invalidateQueries({ queryKey: queryKeys.users });
      form.reset({ email: "", password: "", role: "EDITOR" });
      onCreated?.(created);
      onSuccess?.();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao criar utilizador");
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
        <FormSection title="Credenciais e papel" description="E-mail único no sistema. Palavra-passe com pelo menos 8 caracteres.">
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
                <FormLabel>Palavra-passe inicial</FormLabel>
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
                <FormDescription>Pode alterar mais tarde na edição do utilizador.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "A guardar…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
