"use client";

import { FormEvent, useState } from "react";
import { addGoalLink, createGoalAction, setManualGoalProgress } from "@/lib/api";
import { FormField, FormSection, PrimaryButton, formControlClass } from "@/components/ui/form-primitives";

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

  const disabled = busy != null;

  return (
    <div className="space-y-5">
      <form className="space-y-4" onSubmit={(event) => void onCreateAction(event)}>
        <FormSection title="Nova ação" description="Tarefas associadas à meta; responsável obrigatório (ID de utilizador).">
          <FormField label="Título" htmlFor={`ga-title-${goalId}`} required className="sm:col-span-2">
            <input id={`ga-title-${goalId}`} required name="title" className={formControlClass} placeholder="Título da ação" />
          </FormField>
          <FormField label="Descrição" htmlFor={`ga-desc-${goalId}`} className="sm:col-span-2">
            <textarea id={`ga-desc-${goalId}`} name="description" className={`${formControlClass} min-h-[72px]`} placeholder="Descrição" rows={3} />
          </FormField>
          <FormField label="Estado" htmlFor={`ga-st-${goalId}`}>
            <select id={`ga-st-${goalId}`} name="status" className={formControlClass}>
              <option value="NOT_STARTED">Não iniciada</option>
              <option value="IN_PROGRESS">Em andamento</option>
              <option value="COMPLETED">Concluída</option>
            </select>
          </FormField>
          <FormField label="Progresso (%)" htmlFor={`ga-pr-${goalId}`}>
            <input id={`ga-pr-${goalId}`} name="progress" type="number" min={0} max={100} defaultValue={0} className={formControlClass} />
          </FormField>
          <FormField label="Responsável (ID)" htmlFor={`ga-rsp-${goalId}`} required className="sm:col-span-2">
            <input id={`ga-rsp-${goalId}`} name="responsibleId" required className={formControlClass} placeholder="UUID do utilizador" />
          </FormField>
          <FormField label="Prazo (opcional)" htmlFor={`ga-due-${goalId}`} className="sm:col-span-2">
            <input id={`ga-due-${goalId}`} name="dueDate" type="date" className={formControlClass} />
          </FormField>
        </FormSection>
        <PrimaryButton type="submit" disabled={disabled} busy={busy === "action"} busyLabel="A guardar…">
          Adicionar ação
        </PrimaryButton>
      </form>

      <form className="space-y-4" onSubmit={(event) => void onLink(event)}>
        <FormSection title="Novo vínculo" description="Ligação a contrato ou identificador de ticket (conforme tipo).">
          <FormField label="Tipo" htmlFor={`gl-type-${goalId}`}>
            <select id={`gl-type-${goalId}`} name="type" className={formControlClass}>
              <option value="CONTRACT">Contrato</option>
              <option value="TICKET">Ticket</option>
            </select>
          </FormField>
          <FormField label="ID de referência" htmlFor={`gl-ref-${goalId}`} required className="sm:col-span-2">
            <input id={`gl-ref-${goalId}`} name="referenceId" required className={formControlClass} placeholder="UUID ou identificador" />
          </FormField>
        </FormSection>
        <PrimaryButton type="submit" disabled={disabled} busy={busy === "link"} busyLabel="A guardar…">
          Adicionar vínculo
        </PrimaryButton>
      </form>

      <form className="space-y-4" onSubmit={(event) => void onManual(event)}>
        <FormSection title="Progresso manual" description="Sobrescreve o progresso calculado (0–100%).">
          <FormField label="Progresso (%)" htmlFor={`gm-pr-${goalId}`} required className="sm:col-span-2">
            <input id={`gm-pr-${goalId}`} name="progress" required type="number" min={0} max={100} className={formControlClass} />
          </FormField>
        </FormSection>
        <button
          type="submit"
          disabled={disabled}
          className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "manual" ? "A guardar…" : "Atualizar progresso"}
        </button>
      </form>

      {status ? (
        <p className="text-sm text-slate-600" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
