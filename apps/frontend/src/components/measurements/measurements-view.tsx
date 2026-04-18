"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Measurement } from "@/lib/api";
import { MeasurementForm } from "@/components/actions/measurement-form";
import { Modal } from "@/components/ui/modal";

const statusLabel: Record<string, string> = {
  OPEN: "Aberta",
  UNDER_REVIEW: "Em revisão",
  APPROVED: "Aprovada",
  GLOSSED: "Glosada"
};

const btnPrimary =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2";

type ContractOption = { id: string; number: string; name: string };

type Props = {
  measurements: Measurement[];
  /** Lista para o formulário «Nova medição» (evita colar UUID). */
  contractOptions?: ContractOption[];
  /** Quando definido, mostra apenas medições deste contrato (filtro por URL). */
  filterContractId?: string;
  /** Título legível do contrato (número — nome); se omitido, usa só o ID. */
  filterContractTitle?: string;
};

export function MeasurementsView({ measurements, contractOptions, filterContractId, filterContractTitle }: Props): JSX.Element {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const rows = filterContractId ? measurements.filter((m) => m.contractId === filterContractId) : measurements;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Medições</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Lista das medições por contrato e competência. Use <strong className="font-medium text-slate-700">Nova medição</strong> para
            cadastrar sem sair desta página.
          </p>
          {filterContractId ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span>
                Filtrando por contrato: <strong className="font-medium text-slate-900">{filterContractTitle ?? filterContractId}</strong>{" "}
                ({rows.length} {rows.length === 1 ? "registro" : "registros"}).
              </span>
              <Link
                href={"/measurements" as Route}
                className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900"
              >
                Limpar filtro
              </Link>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className={btnPrimary}>
          <span className="text-lg leading-none" aria-hidden>
            +
          </span>
          Nova medição
        </button>
      </div>

      <section className="overflow-hidden border border-slate-200/90 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-medium text-slate-700">Cadastradas</span>
          <span className="tabular-nums text-xs font-medium uppercase tracking-wide text-slate-400">
            {rows.length} {rows.length === 1 ? "registro" : "registros"}
            {filterContractId && rows.length !== measurements.length ? (
              <span className="ml-1 font-normal normal-case text-slate-400">de {measurements.length} no total</span>
            ) : null}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Contrato</th>
                <th className="px-5 py-3">Referência</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Valor aprovado</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="transition hover:bg-slate-50/60">
                  <td className="px-5 py-3 text-slate-800">{r.contract?.name ?? r.contractId}</td>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-600">
                    {String(r.referenceMonth).padStart(2, "0")}/{r.referenceYear}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-sm border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {statusLabel[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-800">
                    R$ {Number(r.totalApprovedValue).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/measurements/${r.id}` as Route}
                      className="text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-sm text-slate-500">
                    {filterContractId
                      ? "Nenhuma medição para este contrato (ou o contrato não existe)."
                      : "Nenhuma medição ainda. Clique em \"Nova medição\" para cadastrar."}
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
        title="Nova medição"
        description="Informe o contrato e a competência (mês/ano). Depois pode calcular e aprovar na página da medição."
      >
        <MeasurementForm
          contractOptions={contractOptions}
          defaultContractId={filterContractId}
          onSuccess={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </div>
  );
}
