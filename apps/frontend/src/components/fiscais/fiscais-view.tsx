"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Fiscal } from "@/lib/api";
import { FiscalForm } from "@/components/actions/fiscal-form";
import { Modal } from "@/components/ui/modal";

const btnPrimary =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2";

type Props = {
  fiscais: Fiscal[];
};

export function FiscaisView({ fiscais }: Props): JSX.Element {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Fiscais e gestores</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Pessoas que podem ser vinculadas a contratos como fiscal ou gestor.{" "}
            <strong className="font-medium text-slate-700">Novo fiscal</strong> abre o cadastro em modal.
          </p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className={btnPrimary}>
          <span className="text-lg leading-none" aria-hidden>
            +
          </span>
          Novo fiscal
        </button>
      </div>

      <section className="overflow-hidden border border-slate-200/90 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-medium text-slate-700">Cadastrados</span>
          <span className="tabular-nums text-xs font-medium uppercase tracking-wide text-slate-400">
            {fiscais.length} {fiscais.length === 1 ? "registro" : "registros"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">ID</th>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">E-mail</th>
                <th className="px-5 py-3">Telefone</th>
                <th className="px-5 py-3 text-right">Como fiscal</th>
                <th className="px-5 py-3 text-right">Como gestor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fiscais.map((f) => (
                <tr key={f.id} className="transition hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-500">{f.id}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">{f.name}</td>
                  <td className="px-5 py-3 text-slate-600">{f.email}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">{f.phone}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-800">{f.contractsAsFiscal?.length ?? 0}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-800">{f.contractsAsManager?.length ?? 0}</td>
                </tr>
              ))}
              {fiscais.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-sm text-slate-500">
                    Nenhum fiscal ou gestor ainda. Clique em &quot;Novo fiscal&quot; para cadastrar.
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
        title="Novo fiscal ou gestor"
        description="Dados de contacto do perfil. Depois associe ao contrato no cadastro do contrato."
      >
        <FiscalForm
          onSuccess={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </div>
  );
}
