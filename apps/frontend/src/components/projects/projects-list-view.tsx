"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { ProjectListItem } from "@/lib/api";
import { createProject, deleteProject, getAuthMe, getProjects, updateProject } from "@/lib/api";
import { ProjectsOverviewDashboard } from "@/components/projects/projects-overview-dashboard";
import { queryKeys } from "@/lib/query-keys";
import { MondayImportWizard } from "@/components/projects/monday-import-wizard";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectListItem | null>(null);
  const [projectName, setProjectName] = useState("");

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
      void qc.invalidateQueries({ queryKey: queryKeys.projectsDashboard });
      void qc.invalidateQueries({ queryKey: [...queryKeys.projectsAllTasksRoot] });
      router.refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível eliminar o projeto.");
    }
  });

  const refreshProjects = (): void => {
    void qc.invalidateQueries({ queryKey: queryKeys.projects });
    void qc.invalidateQueries({ queryKey: queryKeys.projectsDashboard });
    void qc.invalidateQueries({ queryKey: [...queryKeys.projectsAllTasksRoot] });
    router.refresh();
  };

  const createMut = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      toast.success("Projeto criado.");
      setCreateOpen(false);
      setProjectName("");
      refreshProjects();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o projeto.");
    }
  });

  const updateMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateProject(id, { name }),
    onSuccess: () => {
      toast.success("Projeto atualizado.");
      setEditingProject(null);
      setProjectName("");
      refreshProjects();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o projeto.");
    }
  });

  const canImport = role === "ADMIN" || role === "EDITOR";

  function openCreateDialog(): void {
    setProjectName("");
    setCreateOpen(true);
  }

  function openEditDialog(project: ProjectListItem): void {
    setProjectName(project.name);
    setEditingProject(project);
  }

  function submitProjectForm(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = projectName.trim();
    if (!name) {
      toast.error("Informe o nome do projeto.");
      return;
    }
    if (editingProject) {
      updateMut.mutate({ id: editingProject.id, name });
    } else {
      createMut.mutate({ name });
    }
  }

  const columns = useMemo<ColumnDef<ProjectListItem, any>[]>(
    () => [
      columnHelper.accessor("name", {
        header: "Projeto",
        enableSorting: true,
        cell: (info) => (
          <Link href={`/projetos/${info.row.original.id}`} className="font-semibold text-foreground hover:underline">
            {info.getValue()}
          </Link>
        )
      }),
      columnHelper.accessor("updatedAt", {
        id: "updatedAt",
        header: "Atualizado",
        enableSorting: true,
        cell: (info) => (
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {new Date(info.getValue()).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )
      }),
      columnHelper.accessor((row) => row._count?.groups ?? 0, {
        id: "groups",
        header: "Grupos",
        enableSorting: true,
        cell: (info) => <span className="tabular-nums text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor((row) => row._count?.tasks ?? 0, {
        id: "tasks",
        header: "Tarefas",
        enableSorting: true,
        cell: (info) => <span className="tabular-nums text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor((row) => row._stats?.overdueNotDone ?? 0, {
        id: "overdue",
        header: "Atraso",
        enableSorting: true,
        cell: (info) => {
          const n = info.getValue() as number;
          const id = info.row.original.id;
          if (n <= 0) return <span className="text-muted-foreground">—</span>;
          return (
            <Link
              href={`/projetos/tarefas?filter=overdue&projectId=${id}`}
              className="font-semibold tabular-nums text-destructive hover:underline"
            >
              {n}
            </Link>
          );
        }
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
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Editar projeto"
                  onClick={() => openEditDialog(ctx.row.original)}
                  aria-label="Editar projeto"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
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
              </>
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
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="gap-2" asChild>
            <Link href="/projetos/tarefas">Todas as tarefas</Link>
          </Button>
          {canImport ? (
            <>
              <Button type="button" className="gap-2" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                Novo projeto
              </Button>
              <Button type="button" className="gap-2" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="h-4 w-4" />
                Importar Excel (Monday)
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <ProjectsOverviewDashboard />

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
          void qc.invalidateQueries({ queryKey: queryKeys.projectsDashboard });
          void qc.invalidateQueries({ queryKey: [...queryKeys.projectsAllTasksRoot] });
          router.refresh();
        }}
      />

      <Dialog
        open={createOpen || editingProject != null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditingProject(null);
            setProjectName("");
          }
        }}
      >
        <DialogContent>
          <form onSubmit={submitProjectForm} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editingProject ? "Editar projeto" : "Novo projeto"}</DialogTitle>
              <DialogDescription>
                {editingProject
                  ? "Altere o nome do projeto cadastrado."
                  : "Cadastre um projeto vazio; as tarefas podem ser importadas pelo Excel do Monday depois."}
              </DialogDescription>
            </DialogHeader>
            <label className="space-y-2 text-sm font-medium">
              <span>Nome do projeto</span>
              <Input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Ex.: Implantação do sistema"
                autoFocus
                disabled={createMut.isPending || updateMut.isPending}
              />
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateOpen(false);
                  setEditingProject(null);
                  setProjectName("");
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? "A guardar…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
