"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import type { FormEvent } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearBrowserAuthToken, readBrowserAuthToken, setBrowserAuthToken } from "@/lib/auth-token";
import { passwordPolicyChecklist, validatePasswordPolicy } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

function PasswordField({
  id,
  label,
  value,
  onChange,
  disabled,
  autoFocus
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}): JSX.Element {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
          required
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Ocultar senha" : "Exibir senha"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function ChangePasswordForm(): JSX.Element {
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const token = readBrowserAuthToken();
    setSessionToken(token);
    setSessionReady(true);
  }, []);

  const checklist = useMemo(() => passwordPolicyChecklist(newPassword), [newPassword]);
  const policyOk = validatePasswordPolicy(newPassword).ok;
  const matchOk = confirmPassword.length > 0 && newPassword === confirmPassword;

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const token = sessionToken || readBrowserAuthToken();
    if (!token) {
      toast.error("Sessão não encontrada. Entre novamente para definir a nova senha.");
      window.location.assign("/login?returnUrl=" + encodeURIComponent("/trocar-senha"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    const policy = validatePasswordPolicy(newPassword);
    if (!policy.ok) {
      toast.error(policy.message);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          newPassword,
          confirmPassword,
          accessToken: token
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        access_token?: string;
        redirectTo?: string;
        user?: { userKind?: string };
      };
      if (!response.ok) {
        // Mantém a sessão ativa para correção — não redireciona ao login em 400.
        throw new Error(payload.error || "Não foi possível alterar a senha.");
      }
      if (payload.access_token) {
        setBrowserAuthToken(payload.access_token);
      }
      toast.success(payload.message || "Senha alterada com sucesso.");
      const raw =
        payload.redirectTo ||
        searchParams.get("returnUrl") ||
        (payload.user?.userKind === "EXTERNAL" ? "/externo/notificacoes" : "/dashboard");
      const next =
        typeof raw === "string" &&
        raw.startsWith("/") &&
        !raw.startsWith("//") &&
        raw !== "/trocar-senha"
          ? raw
          : "/dashboard";
      window.location.assign(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar a senha.");
      setIsSubmitting(false);
    }
  }

  if (!sessionReady) {
    return <p className="text-sm text-muted-foreground">Carregando sessão…</p>;
  }

  if (!sessionToken) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          Não foi possível recuperar a sessão deste navegador. Entre novamente para continuar.
        </p>
        <Button asChild className="w-full">
          <Link href={"/login?returnUrl=%2Ftrocar-senha"}>Ir para o login</Link>
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <PasswordField
        id="new-password"
        label="Nova senha"
        value={newPassword}
        onChange={setNewPassword}
        disabled={isSubmitting}
        autoFocus
      />
      <PasswordField
        id="confirm-password"
        label="Confirmar nova senha"
        value={confirmPassword}
        onChange={setConfirmPassword}
        disabled={isSubmitting}
      />

      <ul className="space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">
        {checklist.map((item) => (
          <li
            key={item.label}
            className={cn(
              "flex items-center gap-2",
              item.met ? "text-emerald-700" : "text-muted-foreground"
            )}
          >
            <span aria-hidden>{item.met ? "✓" : "○"}</span>
            {item.label}
          </li>
        ))}
        <li
          className={cn(
            "flex items-center gap-2",
            matchOk ? "text-emerald-700" : "text-muted-foreground"
          )}
        >
          <span aria-hidden>{matchOk ? "✓" : "○"}</span>
          As duas senhas coincidem
        </li>
      </ul>

      <Button
        type="submit"
        className="w-full"
        disabled={isSubmitting || !policyOk || !matchOk}
      >
        {isSubmitting ? "Salvando…" : "Definir nova senha"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        A senha provisória já foi validada no login. Informe apenas a nova senha e a confirmação.
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
          <CardDescription>
            Defina uma senha própria para acessar o SIGTI. Até concluir esta etapa, as demais áreas
            permanecem bloqueadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
            <ChangePasswordForm />
          </Suspense>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Entrou com a conta errada?{" "}
            <Link
              href="/api/auth/logout"
              className="underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground"
              onClick={() => clearBrowserAuthToken()}
            >
              Sair
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
