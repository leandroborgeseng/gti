"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ProjectListItem } from "@/lib/api";
import { deleteProject, getAuthMe, getProjects } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { MondayImportWizard } from "@/components/projects/monday-import-wizard";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";

const columnHelper = createColumnHelper<ProjectListItem>();

type Props = {
  projects: ProjectListItem[];
  dataLoadErrors?: string[];
};

export function ProjectsListView({ projects: initialProjects, dataLoadErrors = [] }: Props): JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    void getAuthMe()
      .then((m) => setRole(m.role))
      .catch(() => setRole(null));
  }, []);

  const { data: projects = initialProjects } = useQuery({
    queryKey: queryKeys.projects,
    queryFn: getProjects,
    initialData: initialProjects
  });

  const deleteMut = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      toast.success("Projeto eliminado.");
      void qc.invalidateQueries({ queryKey: queryKeys.projects });
      router.refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível eliminar o projeto.");
    }
  });

  const canImport = role === "ADMIN" || role === "EDITOR";

  const columns = useMemo<ColumnDef<ProjectListItem, any>[]>(
    () => [
      columnHelper.accessor("name", {
        header: "Projeto",
        cell: (info) => (
          <Link href={`/projetos/${info.row.original.id}`} className="font-semibold text-foreground hover:underline">
            {info.getValue()}
          </Link>
        )
      }),
      columnHelper.accessor((row) => row._count?.groups ?? 0, {
        id: "groups",
        header: "Grupos",
        cell: (info) => <span className="tabular-nums text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor((row) => row._count?.tasks ?? 0, {
        id: "tasks",
        header: "Tarefas",
        cell: (info) => <span className="tabular-nums text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.display({
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: (ctx) => (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="link" className="h-auto p-0 text-foreground" asChild>
              <Link href={`/projetos/${ctx.row.original.id}`}>Abrir</Link>
            </Button>
            {canImport ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                title="Eliminar projeto"
                disabled={deleteMut.isPending}
                onClick={() => {
                  if (
                    !confirm(
                      `Eliminar o projeto «${ctx.row.original.name}» e todas as tarefas? Esta ação não pode ser anulada.`
                    )
                  ) {
                    return;
                  }
                  deleteMut.mutate(ctx.row.original.id);
                }}
                aria-label="Eliminar projeto"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        )
      })
    ],
    [canImport, deleteMut.isPending]
  );

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projetos</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Importação de planilhas exportadas do Monday.com (Excel). Cada folha vira um grupo; linhas viram tarefas com subtarefas a
            partir de «Subelementos».
          </p>
        </div>
        {canImport ? (
          <Button type="button" className="shrink-0 gap-2" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" />
            Importar Excel (Monday)
          </Button>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <DataTable
          columns={columns}
          data={projects}
          searchPlaceholder="Pesquisar projeto…"
          emptyLabel="Nenhum projeto ainda. Importe um Excel do Monday.com."
        />
      </section>

      <MondayImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          void qc.invalidateQueries({ queryKey: queryKeys.projects });
          router.refresh();
        }}
      />
    </div>
  );
}
