"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function ChangePasswordForm(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível alterar a senha.");
      }
      toast.success(payload.message || "Senha alterada com sucesso.");
      const raw = searchParams.get("returnUrl") ?? "/dashboard";
      const next = raw.startsWith("/") && !raw.startsWith("//") && raw !== "/trocar-senha" ? raw : "/dashboard";
      router.replace(next);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar a senha.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <Input
        type="password"
        autoComplete="current-password"
        placeholder="Senha atual"
        value={currentPassword}
        disabled={isSubmitting}
        onChange={(event) => setCurrentPassword(event.target.value)}
        required
      />
      <Input
        type="password"
        autoComplete="new-password"
        placeholder="Nova senha"
        value={newPassword}
        minLength={8}
        disabled={isSubmitting}
        onChange={(event) => setNewPassword(event.target.value)}
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
        {isSubmitting ? "Salvando…" : "Alterar senha"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Esta etapa é obrigatória no primeiro acesso ou quando um administrador redefine a sua senha.
      </p>
    </form>
  );
}

export default function TrocarSenhaPage(): JSX.Element {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Trocar senha obrigatória</CardTitle>
          <CardDescription>Antes de continuar, defina uma senha própria com pelo menos 8 caracteres.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
            <ChangePasswordForm />
          </Suspense>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Entrou com a conta errada?{" "}
            <Link href="/api/auth/logout" className="underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground">
              Sair
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
