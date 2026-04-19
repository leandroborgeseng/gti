"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProjectListItem } from "@/lib/api";
import { getAuthMe } from "@/lib/api";
import { MondayImportWizard } from "@/components/projects/monday-import-wizard";
import { buttonPrimaryClass } from "@/components/ui/form-primitives";
import { DataLoadAlert } from "@/components/ui/data-load-alert";

type Props = {
  projects: ProjectListItem[];
  dataLoadErrors?: string[];
};

export function ProjectsListView({ projects, dataLoadErrors = [] }: Props): JSX.Element {
  const router = useRouter();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    void getAuthMe()
      .then((m) => setRole(m.role))
      .catch(() => setRole(null));
  }, []);

  const canImport = role === "ADMIN" || role === "EDITOR";

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Projetos</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Importação de planilhas exportadas do Monday.com (Excel). Cada folha vira um grupo; linhas viram tarefas com
            subtarefas a partir de «Subelementos».
          </p>
        </div>
        {canImport ? (
          <button type="button" className={buttonPrimaryClass} onClick={() => setImportOpen(true)}>
            Importar Excel (Monday)
          </button>
        ) : null}
      </div>

      <section className="overflow-hidden border border-slate-200/90 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-medium text-slate-700">Projetos</span>
          <span className="tabular-nums text-xs font-medium uppercase tracking-wide text-slate-400">
            {projects.length} {projects.length === 1 ? "registro" : "registros"}
          </span>
        </div>
        <ul className="divide-y divide-slate-100">
          {projects.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 transition hover:bg-slate-50/60">
              <div>
                <Link href={`/projetos/${p.id}`} className="text-base font-semibold text-slate-900 hover:underline">
                  {p.name}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  {p._count?.groups ?? 0} grupo(s) · {p._count?.tasks ?? 0} tarefa(s)
                </p>
              </div>
              <Link
                href={`/projetos/${p.id}`}
                className="text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
              >
                Abrir
              </Link>
            </li>
          ))}
          {projects.length === 0 ? (
            <li className="px-5 py-12 text-center text-sm text-slate-500">Nenhum projeto ainda. Importe um Excel do Monday.com.</li>
          ) : null}
        </ul>
      </section>

      <MondayImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => router.refresh()}
      />
    </div>
  );
}
