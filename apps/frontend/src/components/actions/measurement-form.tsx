"use client";

import { FormEvent, useState } from "react";
import { createMeasurement } from "@/lib/api";

type ContractOption = { id: string; number: string; name: string };

type Props = {
  onSuccess?: () => void;
  /** Lista de contratos ativos; com dados, o campo vira select em vez de UUID. */
  contractOptions?: ContractOption[];
  /** Pré-preenche o ID do contrato (ex.: página de medições com `?contractId=`). */
  defaultContractId?: string;
};

const field =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-900/10";

export function MeasurementForm({ onSuccess, contractOptions, defaultContractId }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const now = new Date();
  const defaultMonth = now.getMonth() + 1;
  const defaultYear = now.getFullYear();

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
      onSuccess?.();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  const hasSelect = Boolean(contractOptions && contractOptions.length > 0);

  return (
    <form className="grid gap-2 md:grid-cols-4" onSubmit={(event) => void onSubmit(event)}>
      {hasSelect ? (
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Contrato</span>
          <select
            required
            name="contractId"
            className={field}
            defaultValue={defaultContractId && contractOptions!.some((c) => c.id === defaultContractId) ? defaultContractId : ""}
          >
            <option value="" disabled>
              Selecione…
            </option>
            {contractOptions!.map((c) => (
              <option key={c.id} value={c.id}>
                {c.number} — {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input
          required
          name="contractId"
          defaultValue={defaultContractId ?? ""}
          className={`${field} md:col-span-2`}
          placeholder="ID do contrato (UUID)"
        />
      )}
      <input required type="number" min={1} max={12} name="referenceMonth" defaultValue={defaultMonth} className={field} placeholder="Mês" />
      <input required type="number" min={2000} max={2100} name="referenceYear" defaultValue={defaultYear} className={field} placeholder="Ano" />
      <p className="text-xs text-slate-500 md:col-span-4">Dica: use a competência atual para facilitar o fluxo de cálculo e aprovação.</p>
      <div className="md:col-span-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "A guardar…" : "Cadastrar medição"}
        </button>
        {status ? <span className="text-sm text-slate-600">{status}</span> : null}
      </div>
    </form>
  );
}
