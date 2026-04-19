"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Goal, UserRecord } from "@/lib/api";
import { GoalCreateForm } from "@/components/actions/goal-create-form";
import { Modal } from "@/components/ui/modal";

const statusLabel: Record<string, string> = {
  PLANNED: "Planejada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída"
};

import { buttonPrimaryClass } from "@/components/ui/form-primitives";
import { DataLoadAlert } from "@/components/ui/data-load-alert";

type Props = {
  goals: Goal[];
  users?: UserRecord[];
  dataLoadErrors?: string[];
};

export function GoalsView({ goals, users = [], dataLoadErrors = [] }: Props): JSX.Element {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Metas estratégicas</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Acompanhamento resumido do andamento. Use <strong className="font-medium text-slate-700">Nova meta</strong> para cadastrar; o
            detalhe e as ações ficam na página da meta.
          </p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className={buttonPrimaryClass}>
          <span className="text-lg leading-none" aria-hidden>
            +
          </span>
          Nova meta
        </button>
      </div>

      <section className="overflow-hidden border border-slate-200/90 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-medium text-slate-700">Cadastradas</span>
          <span className="tabular-nums text-xs font-medium uppercase tracking-wide text-slate-400">
            {goals.length} {goals.length === 1 ? "registro" : "registros"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Meta</th>
                <th className="px-5 py-3">Ano</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Progresso</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {goals.map((goal) => (
                <tr key={goal.id} className="transition hover:bg-slate-50/60">
                  <td className="max-w-[240px] truncate px-5 py-3 font-medium text-slate-900" title={goal.title}>
                    {goal.title}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-600">{goal.year}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-sm border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {statusLabel[goal.status] ?? goal.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-800">{goal.calculatedProgress ?? 0}%</td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/goals/${goal.id}` as Route}
                      className="text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
              {goals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-sm text-slate-500">
                    Nenhuma meta ainda. Clique em &quot;Nova meta&quot; para cadastrar.
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
        title="Nova meta"
        description="Cadastro inicial. Na página da meta pode adicionar ações, vínculos e progresso manual."
      >
        <GoalCreateForm
          users={users}
          onSuccess={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </div>
  );
}
