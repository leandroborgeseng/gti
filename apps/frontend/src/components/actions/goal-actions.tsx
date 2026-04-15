"use client";

import { FormEvent, useState } from "react";
import { addGoalLink, createGoalAction, setManualGoalProgress } from "@/lib/api";

type Props = {
  goalId: string;
};

export function GoalActions({ goalId }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"action" | "link" | "manual" | null>(null);

  async function onCreateAction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy("action");
      await createGoalAction(goalId, {
        title: String(data.get("title") ?? ""),
        description: String(data.get("description") ?? ""),
        status: String(data.get("status") ?? "NOT_STARTED") as "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED",
        progress: Number(data.get("progress") ?? 0),
        dueDate: String(data.get("dueDate") ?? "") || undefined,
        responsibleId: String(data.get("responsibleId") ?? "")
      });
      setStatus("Ação adicionada com sucesso.");
      event.currentTarget.reset();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(null);
    }
  }

  async function onLink(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy("link");
      await addGoalLink(goalId, {
        type: String(data.get("type") ?? "CONTRACT") as "CONTRACT" | "TICKET",
        referenceId: String(data.get("referenceId") ?? "")
      });
      setStatus("Vínculo adicionado com sucesso.");
      event.currentTarget.reset();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(null);
    }
  }

  async function onManual(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy("manual");
      await setManualGoalProgress(goalId, Number(data.get("progress") ?? 0));
      setStatus("Progresso manual atualizado.");
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <form className="space-y-2" onSubmit={(event) => void onCreateAction(event)}>
        <p className="font-semibold">Nova ação</p>
        <input required name="title" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Título da ação" />
        <textarea name="description" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Descrição" rows={3} />
        <div className="grid gap-2 md:grid-cols-3">
          <select name="status" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="NOT_STARTED">NOT_STARTED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="COMPLETED">COMPLETED</option>
          </select>
          <input name="progress" type="number" min={0} max={100} defaultValue={0} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input name="responsibleId" required className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Responsável" />
        </div>
        <input name="dueDate" type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <button
          type="submit"
          disabled={busy != null}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "action" ? "Salvando..." : "Adicionar ação"}
        </button>
      </form>

      <form className="space-y-2" onSubmit={(event) => void onLink(event)}>
        <p className="font-semibold">Adicionar vínculo</p>
        <div className="grid gap-2 md:grid-cols-2">
          <select name="type" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="CONTRACT">CONTRACT</option>
            <option value="TICKET">TICKET</option>
          </select>
          <input name="referenceId" required className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="ID de referência" />
        </div>
        <button
          type="submit"
          disabled={busy != null}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "link" ? "Salvando..." : "Adicionar vínculo"}
        </button>
      </form>

      <form className="space-y-2" onSubmit={(event) => void onManual(event)}>
        <p className="font-semibold">Ajuste manual de progresso</p>
        <input name="progress" required type="number" min={0} max={100} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <button
          type="submit"
          disabled={busy != null}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "manual" ? "Salvando..." : "Atualizar progresso"}
        </button>
      </form>
      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
    </div>
  );
}
