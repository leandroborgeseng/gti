"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Contract } from "@/lib/api";
import { ContractForm } from "@/components/actions/contract-form";
import { Modal } from "@/components/ui/modal";

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativo",
  EXPIRED: "Encerrado",
  SUSPENDED: "Suspenso"
};

type Props = {
  contracts: Contract[];
};

export function ContractsView({ contracts }: Props): JSX.Element {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Contratos</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Lista dos contratos cadastrados. Use <strong className="font-medium text-slate-700">Novo contrato</strong> para abrir o
            cadastro sem sair desta página.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          <span className="text-lg leading-none" aria-hidden>
            +
          </span>
          Novo contrato
        </button>
      </div>

      <section className="overflow-hidden border border-slate-200/90 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-medium text-slate-700">Cadastrados</span>
          <span className="tabular-nums text-xs font-medium uppercase tracking-wide text-slate-400">
            {contracts.length} {contracts.length === 1 ? "registro" : "registros"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Número</th>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">Fornecedor</th>
                <th className="px-5 py-3 text-right">Valor mensal</th>
                <th className="px-5 py-3">Vigência (fim)</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contracts.map((c) => (
                <tr key={c.id} className="transition hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-600">{c.number}</td>
                  <td className="max-w-[200px] truncate px-5 py-3 font-medium text-slate-900" title={c.name}>
                    {c.name}
                  </td>
                  <td className="max-w-[180px] truncate px-5 py-3 text-slate-600" title={c.supplier?.name ?? c.companyName}>
                    {c.supplier?.name ?? c.companyName}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-800">
                    R$ {Number(c.monthlyValue).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">{new Date(c.endDate).toLocaleDateString("pt-BR")}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-sm border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {statusLabel[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/contracts/${c.id}` as Route}
                      className="text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
              {contracts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <p className="text-sm text-slate-500">Nenhum contrato ainda. Clique em &quot;Novo contrato&quot; para cadastrar.</p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo contrato"
        description="Preencha os campos obrigatórios. O contrato fica disponível na lista assim que for salvo."
      >
        <ContractForm
          onSuccess={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </div>
  );
}
