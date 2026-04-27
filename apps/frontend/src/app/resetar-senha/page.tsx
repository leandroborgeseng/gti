"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function ResetarSenhaForm(): JSX.Element {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível redefinir a senha.");
      }
      setDone(true);
      toast.success(payload.message || "Senha redefinida com sucesso.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível redefinir a senha.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>O link de redefinição está incompleto. Solicite um novo link.</p>
        <Button asChild className="w-full">
          <Link href="/recuperar-senha">Solicitar novo link</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>A sua senha foi redefinida. Agora você pode fazer login com a nova senha.</p>
        <Button asChild className="w-full">
          <Link href="/login">Ir para o login</Link>
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <Input
        type="password"
        autoComplete="new-password"
        placeholder="Nova senha"
        value={password}
        minLength={8}
        disabled={isSubmitting}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <Input
        type="password"
        autoComplete="new-password"
        placeholder="Confirme a nova senha"
        value={confirmPassword}
        minLength={8}
        disabled={isSubmitting}
        onChange={(event) => setConfirmPassword(event.target.value)}
        required
      />
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Salvando…" : "Redefinir senha"}
      </Button>
    </form>
  );
}

export default function ResetarSenhaPage(): JSX.Element {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Definir nova senha</CardTitle>
          <CardDescription>Escolha uma senha com pelo menos 8 caracteres.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
            <ResetarSenhaForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
