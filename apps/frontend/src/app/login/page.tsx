"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";

function LoginForm(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password })
      });
      if (!r.ok) {
        setError((await r.text()) || "Credenciais inválidas");
        return;
      }
      const raw = searchParams.get("returnUrl") ?? "/dashboard";
      const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
      router.replace(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-md space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Iniciar sessão</h1>
          <p className="mt-1 text-sm text-slate-600">Gestão contratual (API protegida por JWT).</p>
        </div>
        {error ? (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        <form className="space-y-3" onSubmit={(ev) => void onSubmit(ev)}>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">E-mail</span>
            <input
              type="email"
              autoComplete="username"
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Palavra-passe</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "A entrar…" : "Entrar"}
          </button>
        </form>
      </Card>
    </div>
  );
}

export default function LoginPage(): JSX.Element {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-slate-600">A carregar…</p>}>
      <LoginForm />
    </Suspense>
  );
}
