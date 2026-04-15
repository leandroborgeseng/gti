"use client";

import { FormEvent, useState } from "react";
import { createMeasurement } from "@/lib/api";

export function MeasurementForm(): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy(true);
      await createMeasurement({
        contractId: String(data.get("contractId") ?? ""),
        referenceMonth: Number(data.get("referenceMonth") ?? 1),
        referenceYear: Number(data.get("referenceYear") ?? new Date().getFullYear())
      });
      setStatus("Medição criada com sucesso.");
      event.currentTarget.reset();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-2 md:grid-cols-4" onSubmit={(event) => void onSubmit(event)}>
      <input required name="contractId" className="rounded-lg border border-border px-3 py-2 text-sm md:col-span-2" placeholder="ID do contrato" />
      <input required type="number" min={1} max={12} name="referenceMonth" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Mês" />
      <input required type="number" min={2000} max={2100} name="referenceYear" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Ano" />
      <div className="md:col-span-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Salvando..." : "Cadastrar medição"}
        </button>
        {status ? <span className="text-sm text-slate-600">{status}</span> : null}
      </div>
    </form>
  );
}
