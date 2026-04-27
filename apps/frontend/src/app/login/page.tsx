"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { loginFormSchema, type LoginFormValues } from "@/modules/auth/login-schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

function LoginForm(): JSX.Element {
  const router = useRouter();
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
        body: JSON.stringify({ email: values.email.trim(), password: values.password })
      });
      const text = await r.text();
      if (!r.ok) {
        throw new Error(text || "Credenciais inválidas");
      }
    },
    onSuccess: () => {
      toast.success("Sessão iniciada.");
      const raw = searchParams.get("returnUrl") ?? "/dashboard";
      const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
      router.replace(next);
      router.refresh();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Credenciais inválidas");
    }
  });

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="w-full max-w-md"
      >
        <Card className="p-0">
          <CardHeader>
            <CardTitle className="text-xl">Iniciar sessão</CardTitle>
            <CardDescription>Gestão de Operações de TI (API protegida por JWT).</CardDescription>
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
                      <FormLabel>Palavra-passe</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="current-password" disabled={login.isPending} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={login.isPending}>
                  {login.isPending ? "A entrar…" : "Entrar"}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  <Link href={"/recuperar-senha" as Route} className="underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground">
                    Esqueci a minha senha
                  </Link>
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Após iniciar sessão, consulte o{" "}
          <Link
            href={"/manual" as Route}
            className="font-medium text-foreground underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground"
          >
            manual do sistema
          </Link>{" "}
          (menu Cadastros e relatórios). Se ainda não entrou, este atalho pede autenticação e abre o manual em seguida.
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage(): JSX.Element {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-muted-foreground">A carregar…</p>}>
      <LoginForm />
    </Suspense>
  );
}
