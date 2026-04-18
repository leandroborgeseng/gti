"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthMe } from "@/lib/api";
import { getAuthMe, updateContract } from "@/lib/api";

type ContractStatus = "ACTIVE" | "EXPIRED" | "SUSPENDED";

const options: Array<{ value: ContractStatus; label: string }> = [
  { value: "ACTIVE", label: "Ativo" },
  { value: "SUSPENDED", label: "Suspenso" },
  { value: "EXPIRED", label: "Encerrado" }
];

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

  useEffect(() => {
    setValue(props.status);
  }, [props.status]);

  useEffect(() => {
    void getAuthMe()
      .then((m: AuthMe) => setRole(m.role))
      .catch(() => setRole(null));
  }, []);

  const canEdit = role === "ADMIN" || role === "EDITOR";

  async function save(): Promise<void> {
    if (value === props.status) return;
    const next = value as ContractStatus;
    if (!options.some((o) => o.value === next)) return;
    setBusy(true);
    setMsg(null);
    try {
      await updateContract(props.contractId, { status: next });
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não foi possível atualizar o estado.");
      setValue(props.status);
    } finally {
      setBusy(false);
    }
  }

  if (role === undefined) {
    return <span className="text-xs text-slate-400">A carregar…</span>;
  }
  if (!canEdit) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 md:mt-0 md:inline-flex md:border-0 md:bg-transparent md:px-0 md:py-0">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Alterar estado</span>
      <label className="sr-only" htmlFor={`contract-status-${props.contractId}`}>
        Estado do contrato
      </label>
      <select
        id={`contract-status-${props.contractId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
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
        disabled={busy || value === props.status}
        onClick={() => void save()}
        className="rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "A gravar…" : "Guardar"}
      </button>
      {msg ? (
        <span className="text-xs text-red-600" role="alert">
          {msg}
        </span>
      ) : null}
    </div>
  );
}
