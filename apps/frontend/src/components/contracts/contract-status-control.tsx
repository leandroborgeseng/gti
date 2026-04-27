"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthMe } from "@/lib/api";
import { getAuthMe, updateContract } from "@/lib/api";
import { Modal } from "@/components/ui/modal";

type ContractStatus = "ACTIVE" | "EXPIRED" | "SUSPENDED";

const options: Array<{ value: ContractStatus; label: string }> = [
  { value: "ACTIVE", label: "Ativo" },
  { value: "SUSPENDED", label: "Suspenso" },
  { value: "EXPIRED", label: "Encerrado" }
];

function statusLabelFor(value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function confirmationCopy(
  previous: string,
  next: ContractStatus
): { title: string; description: string } {
  const prevLeg = statusLabelFor(previous);
  if (next === "EXPIRED") {
    return {
      title: "Encerrar contrato?",
      description: `Isto indica encerramento administrativo ou fim de vigência tratado como concluído. Estado atual: ${prevLeg}.`
    };
  }
  if (next === "SUSPENDED") {
    return {
      title: "Suspender contrato?",
      description: `Enquanto estiver suspenso, não será possível registrar novos aditivos neste fluxo. Estado atual: ${prevLeg}.`
    };
  }
  return {
    title: "Reativar contrato?",
    description: `O contrato passará a «Ativo» e voltará a permitir aditivos e demais operações conforme as regras do sistema. Estado atual: ${prevLeg}.`
  };
}

type Props = {
  contractId: string;
  status: string;
};

export function ContractStatusControl(props: Props): JSX.Element | null {
  const router = useRouter();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [value, setValue] = useState<string>(props.status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingNext, setPendingNext] = useState<ContractStatus | null>(null);

  useEffect(() => {
    setValue(props.status);
  }, [props.status]);

  useEffect(() => {
    void getAuthMe()
      .then((m: AuthMe) => setRole(m.role))
      .catch(() => setRole(null));
  }, []);

  const canEdit = role === "ADMIN" || role === "EDITOR";

  function openConfirm(): void {
    if (value === props.status) return;
    const next = value as ContractStatus;
    if (!options.some((o) => o.value === next)) return;
    setPendingNext(next);
    setConfirmOpen(true);
  }

  function closeConfirm(): void {
    setConfirmOpen(false);
    setPendingNext(null);
    setValue(props.status);
  }

  async function applyStatusChange(): Promise<void> {
    if (!pendingNext) return;
    setBusy(true);
    setMsg(null);
    try {
      await updateContract(props.contractId, { status: pendingNext });
      setConfirmOpen(false);
      setPendingNext(null);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não foi possível atualizar o estado.");
      setValue(props.status);
      setConfirmOpen(false);
      setPendingNext(null);
    } finally {
      setBusy(false);
    }
  }

  const confirmTexts =
    pendingNext != null ? confirmationCopy(props.status, pendingNext) : { title: "", description: "" };

  if (role === undefined) {
    return <span className="text-xs text-slate-400">Carregando…</span>;
  }
  if (!canEdit) {
    return null;
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 md:mt-0 md:inline-flex md:border-0 md:bg-transparent md:px-0 md:py-0">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Alterar estado</span>
        <label className="sr-only" htmlFor={`contract-status-${props.contractId}`}>
          Estado do contrato
        </label>
        <select
          id={`contract-status-${props.contractId}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy || confirmOpen}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 disabled:opacity-60"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || value === props.status || confirmOpen}
          onClick={() => openConfirm()}
          className="rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Salvar
        </button>
        {msg ? (
          <span className="text-xs text-red-600" role="alert">
            {msg}
          </span>
        ) : null}
      </div>

      <Modal
        open={confirmOpen && pendingNext != null}
        onClose={() => !busy && closeConfirm()}
        title={confirmTexts.title}
        description={confirmTexts.description}
      >
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => !busy && closeConfirm()}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void applyStatusChange()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? "Salvando…" : "Confirmar"}
          </button>
        </div>
      </Modal>
    </>
  );
}
