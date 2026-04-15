"use client";

import { FormEvent, useState } from "react";
import { createSupplier } from "@/lib/api";

type Props = {
  onSuccess?: () => void;
};

export function SupplierForm({ onSuccess }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy(true);
      await createSupplier({
        name: String(data.get("name") ?? ""),
        cnpj: String(data.get("cnpj") ?? "")
      });
      setStatus("Fornecedor cadastrado com sucesso.");
      event.currentTarget.reset();
      onSuccess?.();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-2 md:grid-cols-3" onSubmit={(event) => void onSubmit(event)}>
      <input required name="name" className="rounded-lg border border-border px-3 py-2 text-sm md:col-span-2" placeholder="Nome do fornecedor" />
      <input required name="cnpj" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="CNPJ" />
      <div className="md:col-span-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "A guardar…" : "Cadastrar fornecedor"}
        </button>
        {status ? <span className="text-sm text-slate-600">{status}</span> : null}
      </div>
    </form>
  );
}
