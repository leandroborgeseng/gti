"use client";

import { FormEvent, useState } from "react";
import { createContract } from "@/lib/api";

export function ContractForm(): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy(true);
      await createContract({
        number: String(data.get("number") ?? ""),
        name: String(data.get("name") ?? ""),
        description: String(data.get("description") ?? "") || undefined,
        companyName: String(data.get("companyName") ?? ""),
        cnpj: String(data.get("cnpj") ?? ""),
        contractType: String(data.get("contractType") ?? "SOFTWARE") as "SOFTWARE" | "DATACENTER" | "INFRA" | "SERVICO",
        lawType: String(data.get("lawType") ?? "LEI_14133") as "LEI_8666" | "LEI_14133",
        startDate: String(data.get("startDate") ?? ""),
        endDate: String(data.get("endDate") ?? ""),
        totalValue: Number(data.get("totalValue") ?? 0),
        monthlyValue: Number(data.get("monthlyValue") ?? 0),
        status: String(data.get("status") ?? "ACTIVE") as "ACTIVE" | "EXPIRED" | "SUSPENDED",
        slaTarget: Number(data.get("slaTarget") ?? 0) || undefined,
        fiscalId: String(data.get("fiscalId") ?? ""),
        managerId: String(data.get("managerId") ?? ""),
        supplierId: String(data.get("supplierId") ?? "") || undefined
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
      <input required name="name" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Nome" />
      <input required name="companyName" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Empresa" />
      <input required name="cnpj" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="CNPJ" />
      <select name="contractType" className="rounded-lg border border-border px-3 py-2 text-sm">
        <option value="SOFTWARE">SOFTWARE</option>
        <option value="DATACENTER">DATACENTER</option>
        <option value="INFRA">INFRA</option>
        <option value="SERVICO">SERVICO</option>
      </select>
      <select name="lawType" className="rounded-lg border border-border px-3 py-2 text-sm">
        <option value="LEI_14133">LEI_14133</option>
        <option value="LEI_8666">LEI_8666</option>
      </select>
      <input required type="date" name="startDate" className="rounded-lg border border-border px-3 py-2 text-sm" />
      <input required type="date" name="endDate" className="rounded-lg border border-border px-3 py-2 text-sm" />
      <input required type="number" step="0.01" name="totalValue" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Valor total" />
      <input required type="number" step="0.01" name="monthlyValue" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Valor mensal" />
      <select name="status" className="rounded-lg border border-border px-3 py-2 text-sm">
        <option value="ACTIVE">ACTIVE</option>
        <option value="SUSPENDED">SUSPENDED</option>
        <option value="EXPIRED">EXPIRED</option>
      </select>
      <input type="number" step="0.01" name="slaTarget" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="SLA alvo (opcional)" />
      <input required name="fiscalId" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Fiscal ID" />
      <input required name="managerId" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Gestor ID" />
      <input name="supplierId" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Fornecedor ID (opcional)" />
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
