"use client";

import { FormEvent, useState } from "react";
import { createGlosa } from "@/lib/api";

export function GlosaForm(): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const measurementId = String(formData.get("measurementId") ?? "").trim();
    const type = String(formData.get("type") ?? "ATRASO") as "ATRASO" | "NAO_ENTREGA" | "SLA" | "QUALIDADE";
    const value = Number(formData.get("value") ?? 0);
    const createdBy = String(formData.get("createdBy") ?? "").trim();
    const justification = String(formData.get("justification") ?? "").trim();
    try {
      setBusy(true);
      await createGlosa({ measurementId, type, value, createdBy, justification });
      setStatus("Glosa cadastrada com sucesso.");
      event.currentTarget.reset();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
      <input required name="measurementId" className="rounded-lg border border-border px-3 py-2" placeholder="ID da medição" />
      <select required name="type" className="rounded-lg border border-border px-3 py-2">
        <option value="ATRASO">ATRASO</option>
        <option value="NAO_ENTREGA">NAO_ENTREGA</option>
        <option value="SLA">SLA</option>
        <option value="QUALIDADE">QUALIDADE</option>
      </select>
      <input required min={0} step="0.01" type="number" name="value" className="rounded-lg border border-border px-3 py-2" placeholder="Valor da glosa" />
      <input required name="createdBy" className="rounded-lg border border-border px-3 py-2" placeholder="Criado por" />
      <textarea required name="justification" className="md:col-span-2 rounded-lg border border-border px-3 py-2" placeholder="Justificativa" />
      <div className="md:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Salvando..." : "Salvar glosa"}
        </button>
        {status ? <span className="text-sm text-slate-600">{status}</span> : null}
      </div>
    </form>
  );
}
