"use client";

import { FormEvent, useState } from "react";
import { createGovernanceTicket } from "@/lib/api";

export function GovernanceCreateForm(): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy(true);
      await createGovernanceTicket({
        ticketId: String(data.get("ticketId") ?? ""),
        contractId: String(data.get("contractId") ?? ""),
        openedAt: String(data.get("openedAt") ?? "") || undefined
      });
      setStatus("Chamado de governança criado com sucesso.");
      event.currentTarget.reset();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-2 md:grid-cols-3" onSubmit={(event) => void onSubmit(event)}>
      <input required name="ticketId" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="ID do ticket GLPI" />
      <input required name="contractId" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="ID do contrato" />
      <input type="datetime-local" name="openedAt" className="rounded-lg border border-border px-3 py-2 text-sm" />
      <p className="text-xs text-slate-500 md:col-span-3">
        Se não informar a data de abertura, o sistema usa automaticamente a data/hora atual.
      </p>
      <div className="md:col-span-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Salvando..." : "Cadastrar chamado governança"}
        </button>
        {status ? <span className="text-sm text-slate-600">{status}</span> : null}
      </div>
    </form>
  );
}
