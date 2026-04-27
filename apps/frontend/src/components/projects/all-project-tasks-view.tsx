"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, type JSX } from "react";
import { toast } from "sonner";
import type { ProjectFlatTaskRow, ProjectsTasksFlatParams } from "@/lib/api";
import { bulkPatchProjectTasks, getProjects, getProjectsTasksFlat } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { isOverdueNotDoneUtc, STATUS_KIND_LABEL, type ProjectTaskStatusKind } from "@/lib/projects-task-status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

function searchParamsToApiParams(sp: URLSearchParams): ProjectsTasksFlatParams {
  const lim = Number.parseInt(sp.get("limit") ?? "100", 10);
  const off = Number.parseInt(sp.get("offset") ?? "0", 10);
  return {
    filter: sp.get("filter") ?? undefined,
    statusKind: sp.get("statusKind") ?? undefined,
    projectId: sp.get("projectId") ?? undefined,
    groupId: sp.get("groupId") ?? undefined,
    assignee: sp.get("assignee") ?? undefined,
    q: sp.get("q") ?? undefined,
    onlyRoot: sp.get("onlyRoot") === "1" || sp.get("onlyRoot") === "true",
    sort: sp.get("sort") ?? "dueDate",
    order: sp.get("order") === "desc" ? "desc" : "asc",
    limit: Number.isFinite(lim) ? lim : 100,
    offset: Number.isFinite(off) ? off : 0
  };
}

function apiParamsToSearchParams(p: ProjectsTasksFlatParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (p.filter) sp.set("filter", p.filter);
  if (p.statusKind) sp.set("statusKind", p.statusKind);
  if (p.projectId) sp.set("projectId", p.projectId);
  if (p.groupId) sp.set("groupId", p.groupId);
  if (p.assignee) sp.set("assignee", p.assignee);
  if (p.q) sp.set("q", p.q);
  if (p.onlyRoot) sp.set("onlyRoot", "true");
  if (p.sort && p.sort !== "dueDate") sp.set("sort", p.sort);
  if (p.order === "desc") sp.set("order", "desc");
  if (p.limit != null && p.limit !== 100) sp.set("limit", String(p.limit));
  if (p.offset != null && p.offset > 0) sp.set("offset", String(p.offset));
  return sp;
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function downloadTasksCsv(rows: ProjectFlatTaskRow[], filename: string): void {
  const headers = [
    "Projeto",
    "Grupo",
    "Título",
    "Status",
    "Tipo status",
    "Data limite",
    "Pessoa",
    "PMF",
    "Subtarefa"
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.projectName),
        csvEscape(r.groupName),
        csvEscape(r.title),
        csvEscape(r.status),
        csvEscape(r.statusKind),
        csvEscape(r.dueDate ? r.dueDate.slice(0, 10) : ""),
        csvEscape(r.assigneeExternal ?? ""),
        csvEscape(r.internalResponsible ?? ""),
        r.parentTaskId ? "sim" : "não"
      ].join(",")
    );
  }
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const STATUS_KIND_OPTIONS: { value: ProjectTaskStatusKind; label: string }[] = (
  ["done", "progress", "notStarted", "blocked", "other", "empty"] as ProjectTaskStatusKind[]
).map((value) => ({ value, label: STATUS_KIND_LABEL[value] }));

export function AllProjectTasksView(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const apiParams = useMemo(() => searchParamsToApiParams(sp), [sp]);
  const queryKeyStr = useMemo(() => JSON.stringify(apiParams), [apiParams]);

  const { data: projects = [] } = useQuery({
    queryKey: queryKeys.projects,
    queryFn: getProjects
  });

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.projectsAllTasksRoot, queryKeyStr],
    queryFn: () => getProjectsTasksFlat(apiParams)
  });

  const replaceParams = useCallback(
    (patch: Partial<ProjectsTasksFlatParams>) => {
      const merged: ProjectsTasksFlatParams = { ...apiParams, ...patch };
      const nsp = apiParamsToSearchParams(merged);
      const s = nsp.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
      setSelected(new Set());
    },
    [apiParams, pathname, router]
  );

  const bulkStatusMutation = useMutation({
    mutationFn: bulkPatchProjectTasks,
    onSuccess: (res) => {
      if (res.failed.length) {
        toast.warning(`Atualizadas ${res.updated}; ${res.failed.length} falharam.`);
      } else {
        toast.success(`${res.updated} tarefa(s) atualizada(s).`);
      }
      void qc.invalidateQueries({ queryKey: [...queryKeys.projectsAllTasksRoot] });
      void qc.invalidateQueries({ queryKey: queryKeys.projectsDashboard });
      void qc.invalidateQueries({ queryKey: queryKeys.projects });
      void refetch();
      setSelected(new Set());
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Falha na operação em massa.");
    }
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? apiParams.limit ?? 100;
  const offset = data?.offset ?? apiParams.offset ?? 0;
  const pageEnd = Math.min(offset + rows.length, offset + limit);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const toggleOne = useCallback((id: string, on: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);

  const toggleAllOnPage = useCallback(
    (on: boolean) => {
      setSelected((prev) => {
        const n = new Set(prev);
        for (const r of rows) {
          if (on) n.add(r.id);
          else n.delete(r.id);
        }
        return n;
      });
    },
    [rows]
  );

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  const applyBulkStatus = useCallback(
    (status: string) => {
      if (!selectedRows.length) return;
      bulkStatusMutation.mutate({
        items: selectedRows.map((r) => ({ projectId: r.projectId, taskId: r.id, status }))
      });
    },
    [bulkStatusMutation, selectedRows]
  );

  const exportCsv = useCallback(() => {
    if (!rows.length) {
      toast.message("Nada para exportar nesta página.");
      return;
    }
    downloadTasksCsv(rows, `tarefas-projetos-${new Date().toISOString().slice(0, 10)}.csv`);
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Todas as tarefas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Vista plana de todas as tarefas dos projetos. Os filtros ficam na URL para poder partilhar o link. Use o quadro do projeto
            para editar em contexto.
          </p>
        </div>
        <Button type="button" variant="outline" asChild>
          <Link href="/projetos">← Voltar aos projetos</Link>
        </Button>
      </div>

      {isError ? <DataLoadAlert messages={[error instanceof Error ? error.message : "Erro ao carregar"]} /> : null}

      <section className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Filtro rápido</label>
            <Select
              value={apiParams.filter ?? "__all__"}
              onValueChange={(v) => replaceParams({ filter: v === "__all__" ? undefined : v, offset: 0 })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="overdue">Atrasadas (não concluídas)</SelectItem>
                <SelectItem value="no_due">Sem data limite (não concluídas)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tipo de status</label>
            <Select
              value={apiParams.statusKind ?? "__all__"}
              onValueChange={(v) => replaceParams({ statusKind: v === "__all__" ? undefined : v, offset: 0 })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Qualquer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Qualquer</SelectItem>
                {STATUS_KIND_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Projeto</label>
            <Select
              value={apiParams.projectId ?? "__all__"}
              onValueChange={(v) =>
                replaceParams({ projectId: v === "__all__" ? undefined : v, groupId: undefined, offset: 0 })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os projetos</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Apenas tarefas raiz</label>
            <div className="flex h-10 items-center gap-2">
              <Checkbox
                id="onlyRoot"
                checked={Boolean(apiParams.onlyRoot)}
                onCheckedChange={(c) => replaceParams({ onlyRoot: c === true, offset: 0 })}
              />
              <label htmlFor="onlyRoot" className="text-sm text-muted-foreground">
                Ocultar subtarefas na listagem
              </label>
            </div>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Pessoa (contém)</label>
            <div className="flex gap-2">
              <Input
                defaultValue={apiParams.assignee ?? ""}
                key={apiParams.assignee ?? ""}
                placeholder="Nome parcial"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  const cur = (apiParams.assignee ?? "").trim();
                  if (v !== cur) replaceParams({ assignee: v || undefined, offset: 0 });
                }}
              />
            </div>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Título (contém)</label>
            <Input
              defaultValue={apiParams.q ?? ""}
              key={apiParams.q ?? ""}
              placeholder="Pesquisar no título…"
              onBlur={(e) => {
                const v = e.target.value.trim();
                const cur = (apiParams.q ?? "").trim();
                if (v !== cur) replaceParams({ q: v || undefined, offset: 0 });
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Ordenar por</label>
            <Select
              value={apiParams.sort ?? "dueDate"}
              onValueChange={(v) => replaceParams({ sort: v, offset: 0 })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dueDate">Data limite</SelectItem>
                <SelectItem value="title">Título</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="project">Projeto</SelectItem>
                <SelectItem value="group">Grupo</SelectItem>
                <SelectItem value="sortOrder">Ordem no Excel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Ordem</label>
            <Select
              value={apiParams.order ?? "asc"}
              onValueChange={(v) => replaceParams({ order: v === "desc" ? "desc" : "asc", offset: 0 })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascendente</SelectItem>
                <SelectItem value="desc">Descendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Limite / página</label>
            <Select
              value={String(limit)}
              onValueChange={(v) => replaceParams({ limit: Number(v), offset: 0 })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 200, 500].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            Exportar CSV (página)
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {isPending ? "Carregando…" : `${total} resultado(s)${data?.truncated ? " (truncado no banco de dados)" : ""}`}
          </span>
        </div>

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
            <span className="font-medium">{selected.size} selecionada(s)</span>
            <Select onValueChange={(status) => applyBulkStatus(status)}>
              <SelectTrigger className="h-8 w-[200px]">
                <SelectValue placeholder="Definir status…" />
              </SelectTrigger>
              <SelectContent>
                {["Feito", "Em progresso", "Não iniciado", "Bloqueado", "Em validação", "Parado"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          </div>
        ) : null}
      </section>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="w-10 p-2">
                <Checkbox
                  checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                  onCheckedChange={(c) => toggleAllOnPage(c === true)}
                  aria-label="Selecionar página"
                />
              </th>
              <th className="p-2">Título</th>
              <th className="p-2 w-[120px]">Status</th>
              <th className="p-2 w-[110px]">Prazo</th>
              <th className="p-2">Projeto</th>
              <th className="p-2">Grupo</th>
              <th className="p-2 w-[100px]">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isPending ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  Nenhuma tarefa com estes filtros.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                <td className="p-2 align-middle">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={(c) => toggleOne(r.id, c === true)} />
                </td>
                <td className="p-2 align-middle">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">{r.title}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {r.parentTaskId ? "Subtarefa" : "Raiz"}
                      {r.assigneeExternal ? ` · ${r.assigneeExternal}` : null}
                    </span>
                  </div>
                </td>
                <td className="p-2 align-middle text-xs">{r.status.trim() || "—"}</td>
                <td className="p-2 align-middle tabular-nums text-xs">
                  {r.dueDate ? (
                    <span className={isOverdueNotDoneUtc(r.dueDate, r.status) ? "font-semibold text-destructive" : ""}>
                      {r.dueDate.slice(0, 10)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-2 align-middle">
                  <Link href={`/projetos/${r.projectId}`} className="text-primary hover:underline">
                    {r.projectName}
                  </Link>
                </td>
                <td className="p-2 align-middle text-muted-foreground">{r.groupName}</td>
                <td className="p-2 align-middle">
                  <Button variant="link" className="h-auto p-0" asChild>
                    <Link href={`/projetos/${r.projectId}`}>Quadro</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Linhas {total === 0 ? 0 : offset + 1}–{pageEnd} de {total}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!canPrev} onClick={() => replaceParams({ offset: Math.max(0, offset - limit) })}>
            Página anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canNext}
            onClick={() => replaceParams({ offset: offset + limit })}
          >
            Página seguinte
          </Button>
        </div>
      </div>
    </div>
  );
}
