"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import type { Route } from "next";
import Link from "next/link";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { AppBrand } from "@/components/brand/app-brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCpfDisplay, isValidCpf, onlyDigitsCpf } from "@/modules/users/user-schemas";

const requestAccessSchema = z
  .object({
    fullName: z.string().min(3, "Informe o nome completo."),
    cpf: z
      .string()
      .min(1, "Informe o CPF.")
      .transform(onlyDigitsCpf)
      .refine((d) => d.length === 11, { message: "CPF deve ter 11 dígitos." })
      .refine(isValidCpf, { message: "CPF inválido." }),
    email: z.string().min(1, "Obrigatório").email("E-mail inválido"),
    userKind: z.enum(["INTERNAL", "EXTERNAL"]),
    organizationId: z.string().optional(),
    supplierId: z.string().optional(),
    externalFunction: z
      .enum([
        "REPRESENTANTE_LEGAL",
        "RESPONSAVEL_CONTRATUAL",
        "RESPONSAVEL_TECNICO",
        "USUARIO_AUXILIAR"
      ])
      .optional()
  })
  .superRefine((val, ctx) => {
    if (val.userKind === "INTERNAL" && !val.organizationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione o órgão.",
        path: ["organizationId"]
      });
    }
    if (val.userKind === "EXTERNAL") {
      if (!val.supplierId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Selecione a empresa representada.",
          path: ["supplierId"]
        });
      }
      if (!val.externalFunction) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe a função ou vínculo com a empresa.",
          path: ["externalFunction"]
        });
      }
    }
  });

type RequestAccessValues = z.infer<typeof requestAccessSchema>;

const EXTERNAL_FUNCTION_LABELS: Record<string, string> = {
  REPRESENTANTE_LEGAL: "Representante legal",
  RESPONSAVEL_CONTRATUAL: "Responsável contratual",
  RESPONSAVEL_TECNICO: "Responsável técnico",
  USUARIO_AUXILIAR: "Outro vínculo"
};

export default function SolicitarAcessoPage(): JSX.Element {
  const optionsQ = useQuery({
    queryKey: ["auth", "register-options"],
    queryFn: async () => {
      const r = await fetch("/api/auth/register-options");
      if (!r.ok) throw new Error("Não foi possível carregar órgãos e empresas.");
      return r.json() as Promise<{
        organizations: { id: string; label: string }[];
        suppliers: { id: string; label: string }[];
      }>;
    }
  });

  const form = useForm<RequestAccessValues>({
    resolver: zodResolver(requestAccessSchema),
    defaultValues: {
      fullName: "",
      cpf: "",
      email: "",
      userKind: "INTERNAL",
      organizationId: undefined,
      supplierId: undefined,
      externalFunction: undefined
    }
  });

  const userKind = useWatch({ control: form.control, name: "userKind" });

  useEffect(() => {
    if (userKind === "INTERNAL") {
      form.setValue("supplierId", undefined);
      form.setValue("externalFunction", undefined);
    } else {
      form.setValue("organizationId", undefined);
    }
  }, [userKind, form]);

  const submit = useMutation({
    mutationFn: async (values: RequestAccessValues) => {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: values.fullName.trim(),
          cpf: values.cpf,
          email: values.email.trim(),
          userKind: values.userKind,
          organizationId: values.userKind === "INTERNAL" ? values.organizationId : null,
          supplierId: values.userKind === "EXTERNAL" ? values.supplierId : null,
          externalFunction: values.userKind === "EXTERNAL" ? values.externalFunction : null
        })
      });
      const text = await r.text();
      let payload: { error?: string; message?: string } = {};
      try {
        payload = text ? (JSON.parse(text) as typeof payload) : {};
      } catch {
        payload = { error: text };
      }
      if (!r.ok) throw new Error(payload.error || "Não foi possível enviar a solicitação");
      return payload;
    },
    onSuccess: (payload) => {
      toast.success(payload.message ?? "Solicitação enviada para aprovação.");
      form.reset({
        fullName: "",
        cpf: "",
        email: "",
        userKind: "INTERNAL",
        organizationId: undefined,
        supplierId: undefined,
        externalFunction: undefined
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar solicitação")
  });

  return (
    <div className="flex min-h-[76vh] items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="w-full max-w-xl"
      >
        <Card className="p-0">
          <CardHeader className="space-y-4">
            <AppBrand variant="login" linkHome={false} />
            <div>
              <CardTitle className="text-xl">Solicitar acesso</CardTitle>
              <CardDescription className="mt-1">
                Preencha seus dados. A administração analisará a solicitação antes de liberar o
                acesso. Perfis e permissões são definidos apenas na aprovação.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pb-6">
            <Form {...form}>
              <form className="space-y-4" onSubmit={form.handleSubmit((v) => submit.mutate(v))}>
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome completo</FormLabel>
                      <FormControl>
                        <Input autoComplete="name" disabled={submit.isPending} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cpf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          autoComplete="off"
                          disabled={submit.isPending}
                          value={formatCpfDisplay(field.value || "")}
                          onChange={(e) => field.onChange(onlyDigitsCpf(e.target.value))}
                        />
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
                        <Input type="email" autoComplete="email" disabled={submit.isPending} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="userKind"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de usuário</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={submit.isPending}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="INTERNAL">Interno</SelectItem>
                          <SelectItem value="EXTERNAL">Externo</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {userKind === "INTERNAL" ? (
                  <FormField
                    control={form.control}
                    name="organizationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Órgão</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={submit.isPending || optionsQ.isPending}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  optionsQ.isPending ? "Carregando órgãos…" : "Selecione o órgão"
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(optionsQ.data?.organizations ?? []).map((o) => (
                              <SelectItem key={o.id} value={o.id}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <>
                    <FormField
                      control={form.control}
                      name="supplierId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Empresa representada</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={submit.isPending || optionsQ.isPending}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    optionsQ.isPending
                                      ? "Carregando empresas…"
                                      : "Selecione a empresa"
                                  }
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(optionsQ.data?.suppliers ?? []).map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="externalFunction"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Função ou vínculo com a empresa</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={submit.isPending}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(EXTERNAL_FUNCTION_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <Button type="submit" className="w-full" disabled={submit.isPending}>
                  {submit.isPending ? "Enviando…" : "Enviar solicitação"}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  <Link
                    href={"/login" as Route}
                    className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                  >
                    Voltar ao login
                  </Link>
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
