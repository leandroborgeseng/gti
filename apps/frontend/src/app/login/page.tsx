"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Image from "next/image";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { loginFormSchema, type LoginFormValues } from "@/modules/auth/login-schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const registerFormSchema = z
  .object({
    email: z.string().min(1, "Obrigatório").email("E-mail inválido"),
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirmPassword: z.string().min(8, "Mínimo 8 caracteres")
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"]
  });

type RegisterFormValues = z.infer<typeof registerFormSchema>;

function LoginForm(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" }
  });
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" }
  });

  const login = useMutation({
    mutationFn: async (values: LoginFormValues) => {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email.trim(), password: values.password })
      });
      const text = await r.text();
      let payload: { error?: string; redirectTo?: string | null } = {};
      try {
        payload = text ? (JSON.parse(text) as typeof payload) : {};
      } catch {
        payload = { error: text };
      }
      if (!r.ok) {
        throw new Error(payload.error || "Credenciais inválidas");
      }
      return payload;
    },
    onSuccess: (payload) => {
      toast.success("Login realizado.");
      const raw = searchParams.get("returnUrl") ?? "/dashboard";
      const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
      router.replace(payload.redirectTo ? `${payload.redirectTo}?returnUrl=${encodeURIComponent(next)}` : next);
      router.refresh();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Credenciais inválidas");
    }
  });

  const register = useMutation({
    mutationFn: async (values: RegisterFormValues) => {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email.trim(), password: values.password })
      });
      const text = await r.text();
      let payload: { error?: string; message?: string } = {};
      try {
        payload = text ? (JSON.parse(text) as typeof payload) : {};
      } catch {
        payload = { error: text };
      }
      if (!r.ok) {
        throw new Error(payload.error || "Não foi possível enviar o cadastro");
      }
      return payload;
    },
    onSuccess: (payload) => {
      toast.success(payload.message ?? "Cadastro enviado para aprovação.");
      registerForm.reset({ email: "", password: "", confirmPassword: "" });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar cadastro");
    }
  });

  return (
    <div className="flex min-h-[76vh] items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr]"
      >
        <Card className="overflow-hidden border-primary/10 bg-gradient-to-br from-primary/10 via-card to-card p-0">
          <CardHeader className="space-y-6 p-8">
            <div className="flex items-center gap-3">
              <Image src="/brand/bluebeaver-logo.png" alt="BlueBeaver" width={176} height={48} priority className="h-auto w-44" />
            </div>
            <div className="space-y-3">
              <CardTitle className="text-2xl">Gestão de Operações de TI</CardTitle>
              <CardDescription className="text-base leading-relaxed">
                Acesse contratos, chamados, medições, metas e projetos em um ambiente único de acompanhamento operacional.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <div className="rounded-xl border bg-background/70 p-4 text-sm text-muted-foreground">
              Primeiro acesso? Cadastre-se ao lado. Sua conta ficará disponível após aprovação da administração.
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="p-0">
            <CardHeader>
              <CardTitle className="text-xl">Entrar</CardTitle>
              <CardDescription>Informe suas credenciais para acessar o sistema.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form className="space-y-4" onSubmit={form.handleSubmit((v) => login.mutate(v))}>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail</FormLabel>
                        <FormControl>
                          <Input type="email" autoComplete="username" disabled={login.isPending} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="current-password" disabled={login.isPending} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={login.isPending}>
                    {login.isPending ? "Entrando…" : "Entrar"}
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    <Link
                      href={"/recuperar-senha" as Route}
                      className="underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground"
                    >
                      Esqueci minha senha
                    </Link>
                  </p>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card className="p-0">
            <CardHeader>
              <CardTitle className="text-xl">Solicitar acesso</CardTitle>
              <CardDescription>Crie sua conta e aguarde a aprovação de um administrador.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...registerForm}>
                <form className="space-y-4" onSubmit={registerForm.handleSubmit((v) => register.mutate(v))}>
                  <FormField
                    control={registerForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail institucional</FormLabel>
                        <FormControl>
                          <Input type="email" autoComplete="email" disabled={register.isPending} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" disabled={register.isPending} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmar senha</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" disabled={register.isPending} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" variant="outline" className="w-full" disabled={register.isPending}>
                    {register.isPending ? "Enviando…" : "Enviar cadastro para aprovação"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage(): JSX.Element {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-muted-foreground">Carregando…</p>}>
      <LoginForm />
    </Suspense>
  );
}
