"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Supplier } from "@/lib/api";
import { SupplierForm } from "@/components/actions/supplier-form";
import { Modal } from "@/components/ui/modal";

import { buttonPrimaryClass } from "@/components/ui/form-primitives";
import { DataLoadAlert } from "@/components/ui/data-load-alert";

type Props = {
  suppliers: Supplier[];
  dataLoadErrors?: string[];
};

export function SuppliersView({ suppliers, dataLoadErrors = [] }: Props): JSX.Element {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Fornecedores</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Fornecedores cadastrados no sistema. Use <strong className="font-medium text-slate-700">Novo fornecedor</strong> para incluir
            dados sem sair desta lista.
          </p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className={buttonPrimaryClass}>
          <span className="text-lg leading-none" aria-hidden>
            +
          </span>
          Novo fornecedor
        </button>
      </div>

      <section className="overflow-hidden border border-slate-200/90 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-medium text-slate-700">Cadastrados</span>
          <span className="tabular-nums text-xs font-medium uppercase tracking-wide text-slate-400">
            {suppliers.length} {suppliers.length === 1 ? "registro" : "registros"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">ID</th>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">CNPJ</th>
                <th className="px-5 py-3 text-right">Contratos vinculados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map((s) => (
                <tr key={s.id} className="transition hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-500">{s.id}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">{s.name}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">{s.cnpj}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-800">{s.contracts?.length ?? 0}</td>
                </tr>
              ))}
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-14 text-center text-sm text-slate-500">
                    Nenhum fornecedor ainda. Clique em &quot;Novo fornecedor&quot; para cadastrar.
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
        title="Novo fornecedor"
        description="Nome e CNPJ são obrigatórios. O registro passa a aparecer na lista após guardar."
      >
        <SupplierForm
          onSuccess={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </div>
  );
}
