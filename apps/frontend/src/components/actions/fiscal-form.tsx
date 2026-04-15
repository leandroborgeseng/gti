"use client";

import { FormEvent, useState } from "react";
import { createFiscal } from "@/lib/api";

export function FiscalForm(): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy(true);
      await createFiscal({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? "")
      });
      setStatus("Fiscal cadastrado com sucesso.");
      event.currentTarget.reset();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-2 md:grid-cols-3" onSubmit={(event) => void onSubmit(event)}>
      <input required name="name" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Nome" />
      <input required type="email" name="email" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="E-mail" />
      <input required name="phone" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Telefone" />
      <div className="md:col-span-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Salvando..." : "Cadastrar fiscal"}
        </button>
        {status ? <span className="text-sm text-slate-600">{status}</span> : null}
      </div>
    </form>
  );
}
