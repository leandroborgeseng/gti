"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Glosa } from "@/lib/api";
import { GlosaForm, type MeasurementOption } from "@/components/actions/glosa-form";
import { Modal } from "@/components/ui/modal";

const typeLabel: Record<string, string> = {
  ATRASO: "Atraso",
  NAO_ENTREGA: "Não entrega",
  SLA: "SLA",
  QUALIDADE: "Qualidade"
};

import { buttonPrimaryClass } from "@/components/ui/form-primitives";
import { DataLoadAlert } from "@/components/ui/data-load-alert";

type Props = {
  glosas: Glosa[];
  measurementOptions?: MeasurementOption[];
  dataLoadErrors?: string[];
};

export function GlosasView({ glosas, measurementOptions, dataLoadErrors = [] }: Props): JSX.Element {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Glosas</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Registro por medição (atraso, não entrega, SLA, qualidade). Use <strong className="font-medium text-slate-700">Nova glosa</strong>{" "}
            para lançar valores; a lista atualiza ao guardar.
          </p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className={buttonPrimaryClass}>
          <span className="text-lg leading-none" aria-hidden>
            +
          </span>
          Nova glosa
        </button>
      </div>

      <section className="overflow-hidden border border-slate-200/90 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-medium text-slate-700">Registradas</span>
          <span className="tabular-nums text-xs font-medium uppercase tracking-wide text-slate-400">
            {glosas.length} {glosas.length === 1 ? "registro" : "registros"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Medição</th>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3 text-right">Valor</th>
                <th className="px-5 py-3">Criado por</th>
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {glosas.map((g) => (
                <tr key={g.id} className="transition hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-600">
                    {g.measurement ? (
                      <span className="font-mono">
                        {String(g.measurement.referenceMonth).padStart(2, "0")}/{g.measurement.referenceYear}
                      </span>
                    ) : (
                      <span className="font-mono">{g.measurementId}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-800">{typeLabel[g.type] ?? g.type}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-800">{g.value}</td>
                  <td className="px-5 py-3 text-slate-600">{g.createdBy}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">{new Date(g.createdAt).toLocaleDateString("pt-BR")}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    <Link
                      href={`/glosas/${g.id}`}
                      className="text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
              {glosas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-sm text-slate-500">
                    Nenhuma glosa ainda. Clique em &quot;Nova glosa&quot; após calcular a medição.
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
        title="Nova glosa"
        description="A glosa deve estar associada a uma medição já calculada. Indique valor e justificativa."
      >
        <GlosaForm
          measurementOptions={measurementOptions}
          onSuccess={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </div>
  );
}
