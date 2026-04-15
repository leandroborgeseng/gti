"use client";

import { FormEvent, useState } from "react";
import { extendGovernanceDeadline, runGovernanceMonitoring, sendGovernanceToControladoria } from "@/lib/api";

type DetailProps = {
  ticketId: string;
};

export function GovernanceListActions(): JSX.Element {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onRun(): Promise<void> {
    try {
      setBusy(true);
      const result = await runGovernanceMonitoring();
      setMessage(
        `Monitoramento executado. Verificados: ${result.checked ?? 0} | SLA violados: ${result.slaViolated ?? 0} | Escalados: ${result.escalated ?? 0}`
      );
    } catch (error) {
      setMessage(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void onRun()}
        disabled={busy}
        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Executando..." : "Executar monitoramento SLA"}
      </button>
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}

export function GovernanceDetailActions({ ticketId }: DetailProps): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"extend" | "controladoria" | null>(null);

  async function onExtend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newDeadline = String(form.get("newDeadline") ?? "");
    const justification = String(form.get("justification") ?? "");
    const createdBy = String(form.get("createdBy") ?? "");
    try {
      setBusy("extend");
      await extendGovernanceDeadline(ticketId, { newDeadline, justification, createdBy });
      setStatus("Prazo estendido com sucesso.");
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(null);
    }
  }

  async function onControladoria(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const seiProcessNumber = String(form.get("seiProcessNumber") ?? "");
    const controladoriaUserId = String(form.get("controladoriaUserId") ?? "");
    try {
      setBusy("controladoria");
      await sendGovernanceToControladoria(ticketId, { seiProcessNumber, controladoriaUserId });
      setStatus("Chamado enviado para controladoria com sucesso.");
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <form className="space-y-2" onSubmit={(event) => void onExtend(event)}>
        <p className="text-sm font-semibold">Extensão de prazo</p>
        <input required name="newDeadline" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="datetime-local" />
        <textarea required name="justification" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Justificativa" />
        <input required name="createdBy" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Usuário responsável" />
        <button
          type="submit"
          disabled={busy != null}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "extend" ? "Salvando..." : "Estender prazo"}
        </button>
      </form>

      <form className="space-y-2" onSubmit={(event) => void onControladoria(event)}>
        <p className="text-sm font-semibold">Encaminhar para controladoria</p>
        <input required name="seiProcessNumber" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Número do processo SEI" />
        <input name="controladoriaUserId" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Usuário da controladoria (opcional)" />
        <button
          type="submit"
          disabled={busy != null}
          className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "controladoria" ? "Enviando..." : "Enviar para controladoria"}
        </button>
      </form>
      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
    </div>
  );
}
