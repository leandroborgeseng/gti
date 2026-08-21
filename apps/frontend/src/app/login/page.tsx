"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { loginFormSchema, type LoginFormValues } from "@/modules/auth/login-schema";
import { AppBrand } from "@/components/brand/app-brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { setBrowserAuthToken } from "@/lib/auth-token";
import { BRAND } from "@/lib/brand";

function LoginForm(): JSX.Element {
  const searchParams = useSearchParams();
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" }
  });

  const login = useMutation({
    mutationFn: async (values: LoginFormValues) => {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: values.email.trim(), password: values.password })
      });
      const text = await r.text();
      let payload: {
        error?: string;
        redirectTo?: string | null;
        access_token?: string;
        user?: { userKind?: string; mustChangePassword?: boolean };
      } = {};
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
      if (payload.access_token) {
        setBrowserAuthToken(payload.access_token);
      }
      toast.success("Login realizado.");
      const defaultHome =
        payload.user?.userKind === "EXTERNAL" ? "/externo/notificacoes" : "/dashboard";
      const raw = searchParams.get("returnUrl") ?? defaultHome;
      const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : defaultHome;
      if (payload.redirectTo === "/trocar-senha") {
        // Reload completo garante que o middleware e o cookie novo estejam alinhados.
        window.location.assign(
          `${payload.redirectTo}?returnUrl=${encodeURIComponent(next)}`
        );
        return;
      }
      if (payload.redirectTo) {
        window.location.assign(payload.redirectTo);
        return;
      }
      window.location.assign(next);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Credenciais inválidas");
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
            <AppBrand variant="login" linkHome={false} />
            <div className="space-y-3">
              <CardTitle className="text-xl leading-snug sm:text-2xl">{BRAND.loginTitle}</CardTitle>
              <CardDescription className="text-base leading-relaxed">{BRAND.description}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <div className="rounded-xl border bg-background/70 p-4 text-sm text-muted-foreground">
              Ainda não possui conta? Use «Solicitar acesso» para enviar um cadastro à administração.
            </div>
          </CardContent>
        </Card>

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
                        <Input
                          type="password"
                          autoComplete="current-password"
                          disabled={login.isPending}
                          {...field}
                        />
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
                <p className="text-center text-sm">
                  <Link
                    href={"/solicitar-acesso" as Route}
                    className="font-medium text-primary underline underline-offset-2 hover:text-primary/90"
                  >
                    Solicitar acesso
                  </Link>
                </p>
                <p className="text-center text-sm text-muted-foreground">
                  <Link
                    href={"/validar-documento" as Route}
                    className="underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground"
                  >
                    Validar documento
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

export default function LoginPage(): JSX.Element {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-muted-foreground">Carregando…</p>}>
      <LoginForm />
    </Suspense>
  );
}
