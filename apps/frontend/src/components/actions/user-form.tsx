"use client";

import { FormEvent, useState } from "react";
import { createUser } from "@/lib/api";

const field =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-900/10";

type Props = {
  onSuccess?: () => void;
};

export function UserForm({ onSuccess }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy(true);
      await createUser({
        email: String(data.get("email") ?? "").trim().toLowerCase(),
        password: String(data.get("password") ?? ""),
        role: (String(data.get("role") ?? "EDITOR") || "EDITOR") as "ADMIN" | "EDITOR" | "VIEWER"
      });
      setStatus("Utilizador criado com sucesso.");
      event.currentTarget.reset();
      onSuccess?.();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">E-mail</label>
        <input required type="email" name="email" className={field} placeholder="nome@instituicao.gov.br" autoComplete="off" />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Palavra-passe inicial</label>
        <input required type="password" name="password" minLength={8} className={field} autoComplete="new-password" />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Papel</label>
        <select name="role" className={field} defaultValue="EDITOR">
          <option value="VIEWER">Leitura (VIEWER)</option>
          <option value="EDITOR">Edição (EDITOR)</option>
          <option value="ADMIN">Administrador (ADMIN)</option>
        </select>
      </div>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? "A guardar…" : "Criar utilizador"}
        </button>
        {status ? <span className="text-sm text-slate-600">{status}</span> : null}
      </div>
    </form>
  );
}
