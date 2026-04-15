"use client";

import { FormEvent, useState } from "react";
import { createGoal } from "@/lib/api";

type Props = {
  onSuccess?: () => void;
};

export function GoalCreateForm({ onSuccess }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy(true);
      await createGoal({
        title: String(data.get("title") ?? ""),
        description: String(data.get("description") ?? "") || undefined,
        year: Number(data.get("year") ?? new Date().getFullYear()),
        status: String(data.get("goalStatus") ?? "PLANNED") as "PLANNED" | "IN_PROGRESS" | "COMPLETED",
        priority: String(data.get("priority") ?? "") || undefined,
        responsibleId: String(data.get("responsibleId") ?? "")
      });
      setStatus("Meta cadastrada com sucesso.");
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
      <input required name="title" className="rounded-lg border border-border px-3 py-2 text-sm md:col-span-2" placeholder="Título da meta" />
      <input required type="number" name="year" min={2020} max={2100} className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Ano" />
      <input required name="responsibleId" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Responsável" />
      <input name="priority" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Prioridade (opcional)" />
      <select name="goalStatus" className="rounded-lg border border-border px-3 py-2 text-sm">
        <option value="PLANNED">Planejada</option>
        <option value="IN_PROGRESS">Em andamento</option>
        <option value="COMPLETED">Concluída</option>
      </select>
      <textarea name="description" className="rounded-lg border border-border px-3 py-2 text-sm md:col-span-3" rows={2} placeholder="Descrição" />
      <div className="md:col-span-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "A guardar…" : "Cadastrar meta"}
        </button>
        {status ? <span className="text-sm text-slate-600">{status}</span> : null}
      </div>
    </form>
  );
}
