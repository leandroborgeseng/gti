"use client";

import { FormEvent, useState } from "react";
import {
  acknowledgeGovernanceTicket,
  classifyGovernanceTicket,
  extendGovernanceDeadline,
  notifyGovernanceManager,
  resolveGovernanceTicket,
  runGovernanceMonitoring,
  sendGovernanceToControladoria
} from "@/lib/api";

type DetailProps = {
  ticketId: string;
};

type ListActionsProps = {
  onMonitoringComplete?: () => void;
};

export function GovernanceListActions({ onMonitoringComplete }: ListActionsProps): JSX.Element {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onRun(): Promise<void> {
    try {
      setBusy(true);
      const result = await runGovernanceMonitoring();
      setMessage(
        `Monitoramento executado. Verificados: ${result.checked ?? 0} | SLA violados: ${result.slaViolated ?? 0} | Escalados: ${result.escalated ?? 0}`
      );
      onMonitoringComplete?.();
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
        className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "A executar…" : "Executar monitoramento de SLA"}
      </button>
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}

export function GovernanceDetailActions({ ticketId }: DetailProps): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"ack" | "classify" | "notify" | "resolve" | "extend" | "controladoria" | null>(null);

  async function onAcknowledge(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const acknowledgedAt = String(form.get("acknowledgedAt") ?? "");
    try {
      setBusy("ack");
      await acknowledgeGovernanceTicket(ticketId, { acknowledgedAt });
      setStatus("Ciência registrada com sucesso.");
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(null);
    }
  }

  async function onClassify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const priority = String(form.get("priority") ?? "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    const type = String(form.get("type") ?? "CORRETIVA") as "CORRETIVA" | "EVOLUTIVA";
    try {
      setBusy("classify");
      await classifyGovernanceTicket(ticketId, { priority, type });
      setStatus("Chamado classificado com sucesso.");
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(null);
    }
  }

  async function onNotify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const description = String(form.get("description") ?? "");
    try {
      setBusy("notify");
      await notifyGovernanceManager(ticketId, { managerNotified: true, description });
      setStatus("Notificação do gestor registrada.");
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(null);
    }
  }

  async function onResolve(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const resolvedAt = String(form.get("resolvedAt") ?? "");
    try {
      setBusy("resolve");
      await resolveGovernanceTicket(ticketId, { resolvedAt });
      setStatus("Chamado marcado como resolvido.");
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(null);
    }
  }

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
      <form className="space-y-2" onSubmit={(event) => void onAcknowledge(event)}>
        <p className="text-sm font-semibold">Registrar ciência</p>
        <input required name="acknowledgedAt" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="datetime-local" />
        <button
          type="submit"
          disabled={busy != null}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "ack" ? "Salvando..." : "Registrar ciência"}
        </button>
      </form>

      <form className="space-y-2" onSubmit={(event) => void onClassify(event)}>
        <p className="text-sm font-semibold">Classificar chamado</p>
        <div className="grid gap-2 md:grid-cols-2">
          <select name="priority" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
          <select name="type" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="CORRETIVA">CORRETIVA</option>
            <option value="EVOLUTIVA">EVOLUTIVA</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={busy != null}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "classify" ? "Salvando..." : "Classificar"}
        </button>
      </form>

      <form className="space-y-2" onSubmit={(event) => void onNotify(event)}>
        <p className="text-sm font-semibold">Notificar gestor</p>
        <textarea required name="description" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} placeholder="Descrição da ação de notificação" />
        <button
          type="submit"
          disabled={busy != null}
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "notify" ? "Salvando..." : "Registrar notificação"}
        </button>
      </form>

      <form className="space-y-2" onSubmit={(event) => void onResolve(event)}>
        <p className="text-sm font-semibold">Registrar resolução</p>
        <input required name="resolvedAt" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="datetime-local" />
        <button
          type="submit"
          disabled={busy != null}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "resolve" ? "Salvando..." : "Marcar como resolvido"}
        </button>
      </form>

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
