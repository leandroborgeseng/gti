"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { ProjectCollection, ProjectListItem } from "@/lib/api";
import {
  createProject,
  createProjectCollection,
  deleteProject,
  deleteProjectCollection,
  getAuthMe,
  getProjectCollections,
  getProjects,
  getProjectSupervisors,
  updateProject,
  updateProjectCollection
} from "@/lib/api";
import { ProjectsOverviewDashboard } from "@/components/projects/projects-overview-dashboard";
import { queryKeys } from "@/lib/query-keys";
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
import { Textarea } from "@/components/ui/textarea";

const columnHelper = createColumnHelper<ProjectListItem>();
const groupAccentColors = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#dc2626", "#0891b2"];

const MondayImportWizard = dynamic(
  async () => (await import("@/components/projects/monday-import-wizard")).MondayImportWizard,
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted-foreground">A carregar importador Excel…</p>
  }
);

type Props = {
  projects: ProjectListItem[];
  dataLoadErrors?: string[];
};

type ProjectExecutionStats = NonNullable<ProjectListItem["_stats"]>;

const emptyExecutionStats: ProjectExecutionStats = {
  total: 0,
  done: 0,
  progress: 0,
  blocked: 0,
  notStarted: 0,
  other: 0,
  empty: 0,
  overdueNotDone: 0,
  completionPercent: 0
};

function normalizeExecutionStats(stats?: ProjectExecutionStats): ProjectExecutionStats {
  if (!stats) return emptyExecutionStats;
  return { ...emptyExecutionStats, ...stats };
}

function aggregateExecutionStats(items: ProjectListItem[]): ProjectExecutionStats {
  const total = items.reduce(
    (acc, project) => {
      const stats = normalizeExecutionStats(project._stats);
      return {
        total: acc.total + stats.total,
        done: acc.done + stats.done,
        progress: acc.progress + stats.progress,
        blocked: acc.blocked + stats.blocked,
        notStarted: acc.notStarted + stats.notStarted,
        other: acc.other + stats.other,
        empty: acc.empty + stats.empty,
        overdueNotDone: acc.overdueNotDone + stats.overdueNotDone,
        completionPercent: 0
      };
    },
    { ...emptyExecutionStats }
  );
  return {
    ...total,
    completionPercent: total.total > 0 ? Math.round((total.done / total.total) * 100) : 0
  };
}

function MiniExecutionChart({ stats, compact = false }: { stats?: ProjectExecutionStats; compact?: boolean }): JSX.Element {
  const data = normalizeExecutionStats(stats);
  const pending = Math.max(data.total - data.done - data.progress - data.blocked, 0);
  const segments = [
    { key: "done", value: data.done, className: "bg-emerald-500" },
    { key: "progress", value: data.progress, className: "bg-sky-500" },
    { key: "blocked", value: data.blocked, className: "bg-amber-500" },
    { key: "pending", value: pending, className: "bg-slate-300" }
  ];

  if (data.total === 0) {
    return <span className="text-xs text-muted-foreground">Sem tarefas</span>;
  }

  return (
    <div className={compact ? "min-w-36 space-y-1" : "space-y-2"}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tabular-nums text-foreground">{data.completionPercent}% concluído</span>
        <span className={data.overdueNotDone > 0 ? "text-xs font-semibold tabular-nums text-destructive" : "text-xs text-muted-foreground"}>
          {data.overdueNotDone > 0 ? `${data.overdueNotDone} atraso(s)` : "sem atrasos"}
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-label={`${data.completionPercent}% concluído`}>
        {segments.map((segment) =>
          segment.value > 0 ? (
            <span
              key={segment.key}
              className={segment.className}
              style={{ width: `${Math.max((segment.value / data.total) * 100, 3)}%` }}
            />
          ) : null
        )}
      </div>
      {!compact ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">Total: {data.total}</span>
          <span className="tabular-nums">Feitas: {data.done}</span>
          <span className="tabular-nums">Em andamento: {data.progress}</span>
          <span className="tabular-nums">Bloqueadas: {data.blocked}</span>
        </div>
      ) : null}
    </div>
  );
}

function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatProjectDate(value?: string | null): string {
  if (!value) return "Não definida";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não definida";
  return date.toLocaleDateString("pt-BR");
}

function ProjectScheduleSummary({ project }: { project: ProjectListItem }): JSX.Element {
  const start = project.startDate ? new Date(project.startDate) : null;
  const end = project.plannedEndDate ? new Date(project.plannedEndDate) : null;
  const now = new Date();
  const hasValidRange = start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end;
  const elapsedPercent = hasValidRange
    ? Math.min(100, Math.max(0, Math.round(((now.getTime() - start.getTime()) / Math.max(end.getTime() - start.getTime(), 1)) * 100)))
    : 0;
  const statusLabel = !start && !end ? "Sem planejamento" : hasValidRange && now > end ? "Fim planejado vencido" : hasValidRange && now >= start ? "Em execução planejada" : "Ainda não iniciado";
  const statusClass = hasValidRange && now > end ? "bg-destructive" : hasValidRange && now >= start ? "bg-sky-500" : "bg-slate-400";

  return (
    <div className="min-w-48 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          Início: <strong className="font-medium text-foreground">{formatProjectDate(project.startDate)}</strong>
        </span>
        <span>
          Fim planejado: <strong className="font-medium text-foreground">{formatProjectDate(project.plannedEndDate)}</strong>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full ${statusClass}`} style={{ width: hasValidRange ? `${Math.max(elapsedPercent, 4)}%` : "100%" }} />
      </div>
      <p className="text-xs text-muted-foreground">{hasValidRange ? `${elapsedPercent}% do prazo planejado decorrido` : statusLabel}</p>
    </div>
  );
}

export function ProjectsListView({ projects: initialProjects, dataLoadErrors = [] }: Props): JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectListItem | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectContext, setProjectContext] = useState("");
  const [projectSupervisorId, setProjectSupervisorId] = useState("");
  const [projectStartDate, setProjectStartDate] = useState("");
  const [projectPlannedEndDate, setProjectPlannedEndDate] = useState("");
  const [projectCollectionId, setProjectCollectionId] = useState("");
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<ProjectCollection | null>(null);
  const [collectionName, setCollectionName] = useState("");

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

  const { data: projectCollections = [] } = useQuery({
    queryKey: queryKeys.projectCollections,
    queryFn: getProjectCollections
  });

  const { data: projectSupervisors = [] } = useQuery({
    queryKey: queryKeys.projectSupervisors,
    queryFn: getProjectSupervisors
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
    void qc.invalidateQueries({ queryKey: queryKeys.projectCollections });
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
      setProjectContext("");
      setProjectSupervisorId("");
      setProjectStartDate("");
      setProjectPlannedEndDate("");
      setProjectCollectionId("");
      refreshProjects();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o projeto.");
    }
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      name,
      context,
      supervisorId,
      startDate,
      plannedEndDate,
      collectionId
    }: {
      id: string;
      name: string;
      context: string;
      supervisorId: string;
      startDate: string;
      plannedEndDate: string;
      collectionId: string;
    }) =>
      updateProject(id, {
        name,
        context: context || null,
        supervisorId: supervisorId || null,
        startDate: startDate || null,
        plannedEndDate: plannedEndDate || null,
        projectCollectionId: collectionId || null
      }),
    onSuccess: () => {
      toast.success("Projeto atualizado.");
      setEditingProject(null);
      setProjectName("");
      setProjectContext("");
      setProjectSupervisorId("");
      setProjectStartDate("");
      setProjectPlannedEndDate("");
      setProjectCollectionId("");
      refreshProjects();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o projeto.");
    }
  });

  const createCollectionMut = useMutation({
    mutationFn: createProjectCollection,
    onSuccess: () => {
      toast.success("Grupo de projetos criado.");
      setCollectionDialogOpen(false);
      setCollectionName("");
      refreshProjects();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o grupo.");
    }
  });

  const updateCollectionMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateProjectCollection(id, { name }),
    onSuccess: () => {
      toast.success("Grupo de projetos atualizado.");
      setEditingCollection(null);
      setCollectionName("");
      refreshProjects();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o grupo.");
    }
  });

  const deleteCollectionMut = useMutation({
    mutationFn: deleteProjectCollection,
    onSuccess: () => {
      toast.success("Grupo de projetos removido.");
      refreshProjects();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover o grupo.");
    }
  });

  const canImport = role === "ADMIN" || role === "EDITOR";
  const projectsByCollectionId = useMemo(() => {
    const map = new Map<string, ProjectListItem[]>();
    for (const project of projects) {
      const collectionId = project.projectCollectionId ?? project.projectCollection?.id;
      if (!collectionId) continue;
      map.set(collectionId, [...(map.get(collectionId) ?? []), project]);
    }
    return map;
  }, [projects]);
  const projectsWithoutCollection = useMemo(
    () => projects.filter((project) => !(project.projectCollectionId ?? project.projectCollection?.id)),
    [projects]
  );

  function openCreateDialog(): void {
    setProjectName("");
    setProjectContext("");
    setProjectSupervisorId("");
    setProjectStartDate("");
    setProjectPlannedEndDate("");
    setProjectCollectionId("");
    setCreateOpen(true);
  }

  function openEditDialog(project: ProjectListItem): void {
    setProjectName(project.name);
    setProjectContext(project.context ?? "");
    setProjectSupervisorId(project.supervisorId ?? project.supervisor?.id ?? "");
    setProjectStartDate(toDateInputValue(project.startDate));
    setProjectPlannedEndDate(toDateInputValue(project.plannedEndDate));
    setProjectCollectionId(project.projectCollectionId ?? project.projectCollection?.id ?? "");
    setEditingProject(project);
  }

  function openCreateCollectionDialog(): void {
    setCollectionName("");
    setEditingCollection(null);
    setCollectionDialogOpen(true);
  }

  function openEditCollectionDialog(collection: ProjectCollection): void {
    setCollectionName(collection.name);
    setEditingCollection(collection);
    setCollectionDialogOpen(true);
  }

  function submitProjectForm(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = projectName.trim();
    if (!name) {
      toast.error("Informe o nome do projeto.");
      return;
    }
    const context = projectContext.trim();
    if (editingProject) {
      updateMut.mutate({
        id: editingProject.id,
        name,
        context,
        supervisorId: projectSupervisorId,
        startDate: projectStartDate,
        plannedEndDate: projectPlannedEndDate,
        collectionId: projectCollectionId
      });
    } else {
      createMut.mutate({
        name,
        context: context || null,
        supervisorId: projectSupervisorId || null,
        startDate: projectStartDate || null,
        plannedEndDate: projectPlannedEndDate || null,
        projectCollectionId: projectCollectionId || null
      });
    }
  }

  function submitCollectionForm(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = collectionName.trim();
    if (!name) {
      toast.error("Informe o nome do grupo.");
      return;
    }
    if (editingCollection) {
      updateCollectionMut.mutate({ id: editingCollection.id, name });
    } else {
      createCollectionMut.mutate({ name });
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
      columnHelper.display({
        id: "schedule",
        header: "Início / fim planejado",
        enableSorting: false,
        cell: (info) => <ProjectScheduleSummary project={info.row.original} />
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
      columnHelper.accessor((row) => row.projectCollection?.name ?? "", {
        id: "projectCollection",
        header: "Grupo de projetos",
        enableSorting: true,
        cell: (info) => {
          const value = info.getValue() as string;
          return value ? <span className="text-sm text-foreground">{value}</span> : <span className="text-muted-foreground">—</span>;
        }
      }),
      columnHelper.display({
        id: "execution",
        header: "Execução",
        enableSorting: false,
        cell: (info) => <MiniExecutionChart stats={info.row.original._stats} compact />
      }),
      columnHelper.accessor((row) => row.supervisor?.email ?? "", {
        id: "supervisor",
        header: "Supervisor",
        enableSorting: true,
        cell: (info) => {
          const value = info.getValue() as string;
          return value ? <span className="text-sm text-foreground">{value}</span> : <span className="text-muted-foreground">—</span>;
        }
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
              <Button type="button" variant="outline" className="gap-2" onClick={openCreateCollectionDialog}>
                Novo grupo
              </Button>
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

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Grupos de projetos</h2>
            <p className="text-sm text-muted-foreground">Agrupe um ou mais projetos para acompanhar iniciativas relacionadas.</p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{projectCollections.length} grupo(s)</span>
        </div>
        {projectCollections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum grupo cadastrado.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projectCollections.map((collection) => {
              const collectionProjects = projectsByCollectionId.get(collection.id) ?? [];
              const executionStats = aggregateExecutionStats(collectionProjects);
              return (
                <div key={collection.id} className="rounded-lg border bg-background p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{collection.name}</h3>
                    <p className="text-xs text-muted-foreground">{collection._count?.projects ?? collection.projects?.length ?? 0} projeto(s)</p>
                  </div>
                  {canImport ? (
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCollectionDialog(collection)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={deleteCollectionMut.isPending}
                        onClick={() => {
                          if (!confirm(`Remover o grupo «${collection.name}»? Os projetos ficarão sem grupo.`)) return;
                          deleteCollectionMut.mutate(collection.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 rounded-md border bg-card/60 p-3">
                  <MiniExecutionChart stats={executionStats} />
                </div>
                {collection.projects?.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {collection.projects.slice(0, 6).map((project) => (
                      <Link key={project.id} href={`/projetos/${project.id}`} className="rounded-full bg-muted px-2 py-1 text-xs text-foreground hover:bg-accent">
                        {project.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground">Lista agrupada por grupos</h2>
          <p className="text-sm text-muted-foreground">Use as sanfonas para acompanhar datas, execução e responsáveis por grupo de projetos.</p>
        </div>
        <div className="space-y-3">
          {projectCollections.map((collection, index) => {
            const collectionProjects = projectsByCollectionId.get(collection.id) ?? [];
            const accentColor = groupAccentColors[index % groupAccentColors.length];
            return (
              <details key={collection.id} className="overflow-hidden rounded-lg border bg-background shadow-sm" open>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-l-4 px-4 py-3" style={{ borderLeftColor: accentColor }}>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{collection.name}</span>
                    <span className="text-xs text-muted-foreground">{collectionProjects.length} projeto(s)</span>
                  </span>
                  <MiniExecutionChart stats={aggregateExecutionStats(collectionProjects)} compact />
                </summary>
                <div className="divide-y">
                  {collectionProjects.length ? (
                    collectionProjects.map((project) => (
                      <div key={project.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(180px,1.2fr)_minmax(260px,1.5fr)_minmax(180px,1fr)_minmax(180px,1fr)] lg:items-center">
                        <Link href={`/projetos/${project.id}`} className="font-medium text-foreground hover:underline">
                          {project.name}
                        </Link>
                        <ProjectScheduleSummary project={project} />
                        <MiniExecutionChart stats={project._stats} compact />
                        <span className="text-xs text-muted-foreground">
                          Supervisor: <strong className="font-medium text-foreground">{project.supervisor?.email ?? "não definido"}</strong>
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum projeto neste grupo.</p>
                  )}
                </div>
              </details>
            );
          })}
          {projectsWithoutCollection.length ? (
            <details className="overflow-hidden rounded-lg border bg-background shadow-sm" open>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-l-4 px-4 py-3" style={{ borderLeftColor: "#64748b" }}>
                <span>
                  <span className="block text-sm font-semibold text-foreground">Sem grupo</span>
                  <span className="text-xs text-muted-foreground">{projectsWithoutCollection.length} projeto(s)</span>
                </span>
                <MiniExecutionChart stats={aggregateExecutionStats(projectsWithoutCollection)} compact />
              </summary>
              <div className="divide-y">
                {projectsWithoutCollection.map((project) => (
                  <div key={project.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(180px,1.2fr)_minmax(260px,1.5fr)_minmax(180px,1fr)_minmax(180px,1fr)] lg:items-center">
                    <Link href={`/projetos/${project.id}`} className="font-medium text-foreground hover:underline">
                      {project.name}
                    </Link>
                    <ProjectScheduleSummary project={project} />
                    <MiniExecutionChart stats={project._stats} compact />
                    <span className="text-xs text-muted-foreground">
                      Supervisor: <strong className="font-medium text-foreground">{project.supervisor?.email ?? "não definido"}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground">Lista geral</h2>
          <p className="text-sm text-muted-foreground">Tabela completa para pesquisar e ordenar todos os projetos.</p>
        </div>
        <DataTable
          columns={columns}
          data={projects}
          searchPlaceholder="Pesquisar projeto…"
          emptyLabel="Nenhum projeto ainda. Importe um Excel do Monday.com."
        />
      </section>

      {importOpen ? (
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
      ) : null}

      <Dialog
        open={createOpen || editingProject != null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditingProject(null);
            setProjectName("");
            setProjectContext("");
            setProjectSupervisorId("");
            setProjectStartDate("");
            setProjectPlannedEndDate("");
            setProjectCollectionId("");
          }
        }}
      >
        <DialogContent>
          <form onSubmit={submitProjectForm} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editingProject ? "Editar projeto" : "Novo projeto"}</DialogTitle>
              <DialogDescription>
                {editingProject
                  ? "Altere o nome, o contexto, o supervisor, as datas planejadas e o grupo do projeto cadastrado."
                  : "Cadastre um projeto vazio com uma apresentação inicial; as tarefas podem ser criadas manualmente ou importadas depois."}
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
            <label className="space-y-2 text-sm font-medium">
              <span>Contexto do projeto</span>
              <Textarea
                value={projectContext}
                onChange={(event) => setProjectContext(event.target.value)}
                placeholder="Descreva o que o projeto faz, por que existe, objetivos principais e informações importantes para acompanhar."
                className="min-h-32"
                disabled={createMut.isPending || updateMut.isPending}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                <span>Data de início</span>
                <Input
                  type="date"
                  value={projectStartDate}
                  onChange={(event) => setProjectStartDate(event.target.value)}
                  disabled={createMut.isPending || updateMut.isPending}
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>Fim planejado</span>
                <Input
                  type="date"
                  value={projectPlannedEndDate}
                  onChange={(event) => setProjectPlannedEndDate(event.target.value)}
                  disabled={createMut.isPending || updateMut.isPending}
                />
              </label>
            </div>
            <label className="space-y-2 text-sm font-medium">
              <span>Supervisor do projeto</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                value={projectSupervisorId}
                disabled={createMut.isPending || updateMut.isPending}
                onChange={(event) => setProjectSupervisorId(event.target.value)}
              >
                <option value="">Sem supervisor definido</option>
                {projectSupervisors.map((supervisor) => (
                  <option key={supervisor.id} value={supervisor.id}>
                    {supervisor.email}
                  </option>
                ))}
              </select>
              <span className="block text-xs font-normal text-muted-foreground">
                Pessoa responsável por acompanhar os status das tarefas e conferir se foram executadas.
              </span>
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>Grupo de projetos</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                value={projectCollectionId}
                disabled={createMut.isPending || updateMut.isPending}
                onChange={(event) => setProjectCollectionId(event.target.value)}
              >
                <option value="">Sem grupo</option>
                {projectCollections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateOpen(false);
                  setEditingProject(null);
                  setProjectName("");
                  setProjectContext("");
                  setProjectSupervisorId("");
                  setProjectStartDate("");
                  setProjectPlannedEndDate("");
                  setProjectCollectionId("");
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

      <Dialog
        open={collectionDialogOpen}
        onOpenChange={(open) => {
          setCollectionDialogOpen(open);
          if (!open) {
            setEditingCollection(null);
            setCollectionName("");
          }
        }}
      >
        <DialogContent>
          <form className="space-y-4" onSubmit={submitCollectionForm}>
            <DialogHeader>
              <DialogTitle>{editingCollection ? "Editar grupo de projetos" : "Novo grupo de projetos"}</DialogTitle>
              <DialogDescription>Use grupos para reunir projetos relacionados sem criar hierarquia entre eles.</DialogDescription>
            </DialogHeader>
            <label className="space-y-2 text-sm font-medium">
              <span>Nome do grupo</span>
              <Input
                value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)}
                placeholder="Ex.: Implantação ERP"
                autoFocus
                disabled={createCollectionMut.isPending || updateCollectionMut.isPending}
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCollectionDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createCollectionMut.isPending || updateCollectionMut.isPending}>
                {createCollectionMut.isPending || updateCollectionMut.isPending ? "A guardar…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
