"use client";

import { FormEvent, useState } from "react";
import { createContract } from "@/lib/api";

const field =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-900/10";

type Props = {
  onSuccess?: () => void;
};

export function ContractForm({ onSuccess }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const startDate = String(data.get("startDate") ?? "");
    const endDate = String(data.get("endDate") ?? "");
    const monthlyValue = Number(data.get("monthlyValue") ?? 0);
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      setStatus("A data final não pode ser anterior à data inicial.");
      return;
    }
    if (!Number.isFinite(monthlyValue) || monthlyValue <= 0) {
      setStatus("Informe um valor mensal maior que zero.");
      return;
    }
    try {
      setBusy(true);
      await createContract({
        number: String(data.get("number") ?? ""),
        name: String(data.get("name") ?? ""),
        description: String(data.get("description") ?? "") || undefined,
        companyName: String(data.get("companyName") ?? ""),
        cnpj: String(data.get("cnpj") ?? ""),
        contractType: String(data.get("contractType") ?? "SOFTWARE") as "SOFTWARE" | "DATACENTER" | "INFRA" | "SERVICO",
        startDate,
        endDate,
        monthlyValue,
        fiscalId: String(data.get("fiscalId") ?? ""),
        managerId: String(data.get("managerId") ?? "") || undefined
      });
      setStatus("Contrato cadastrado com sucesso.");
      event.currentTarget.reset();
      onSuccess?.();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Número do contrato</label>
        <input required name="number" className={field} placeholder="Ex.: 001/2026" />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Nome</label>
        <input required name="name" className={field} placeholder="Denominação do contrato" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Fornecedor</label>
        <input required name="companyName" className={field} placeholder="Razão social" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">CNPJ</label>
        <input required name="cnpj" className={field} placeholder="00.000.000/0000-00" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Tipo</label>
        <select name="contractType" className={field}>
          <option value="SOFTWARE">Software</option>
          <option value="DATACENTER">Datacenter</option>
          <option value="INFRA">Infraestrutura</option>
          <option value="SERVICO">Serviço</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Valor mensal (R$)</label>
        <input required type="number" min="0.01" step="0.01" name="monthlyValue" className={field} placeholder="0,00" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Início da vigência</label>
        <input required type="date" name="startDate" className={field} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Fim da vigência</label>
        <input required type="date" name="endDate" className={field} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Fiscal (ID)</label>
        <input required name="fiscalId" className={field} placeholder="UUID do fiscal" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Gestor (ID, opcional)</label>
        <input name="managerId" className={field} placeholder="UUID do gestor" />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Descrição (opcional)</label>
        <textarea name="description" className={`${field} min-h-[88px] resize-y`} rows={3} placeholder="Objeto ou observações" />
      </div>

      {status ? (
        <p className={`sm:col-span-2 text-sm ${status.includes("sucesso") ? "text-emerald-700" : "text-amber-800"}`}>{status}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "A guardar…" : "Guardar contrato"}
        </button>
      </div>
    </form>
  );
}
