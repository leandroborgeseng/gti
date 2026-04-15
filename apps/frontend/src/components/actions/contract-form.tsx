"use client";

import { FormEvent, useState } from "react";
import { createContract } from "@/lib/api";

export function ContractForm(): JSX.Element {
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
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-2 md:grid-cols-3" onSubmit={(event) => void onSubmit(event)}>
      <input required name="number" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Número do contrato" />
      <input required name="name" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Nome do contrato" />
      <input required name="companyName" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Fornecedor" />
      <input required name="cnpj" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="CNPJ" />
      <select name="contractType" className="rounded-lg border border-border px-3 py-2 text-sm">
        <option value="SOFTWARE">SOFTWARE</option>
        <option value="DATACENTER">DATACENTER</option>
        <option value="INFRA">INFRA</option>
        <option value="SERVICO">SERVICO</option>
      </select>
      <input required type="date" name="startDate" className="rounded-lg border border-border px-3 py-2 text-sm" />
      <input required type="date" name="endDate" className="rounded-lg border border-border px-3 py-2 text-sm" />
      <input required type="number" min="0.01" step="0.01" name="monthlyValue" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Valor mensal" />
      <input required name="fiscalId" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Fiscal responsável (ID)" />
      <input name="managerId" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Gestor (ID, opcional)" />
      <textarea name="description" className="md:col-span-3 rounded-lg border border-border px-3 py-2 text-sm" rows={2} placeholder="Descrição" />
      <div className="md:col-span-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Salvando..." : "Cadastrar contrato"}
        </button>
        {status ? <span className="text-sm text-slate-600">{status}</span> : null}
      </div>
    </form>
  );
}
