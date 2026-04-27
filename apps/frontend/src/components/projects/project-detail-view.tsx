"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ProjectDetail } from "@/lib/api";
import { createProject, getAuthMe } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { ProjectTasksBoard } from "@/components/projects/project-tasks-board";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type ProjectBoardQuery = { filter?: string; statusKind?: string; sort?: string };

export function ProjectDetailView({
  project,
  boardQuery
}: {
  project: ProjectDetail;
  boardQuery?: ProjectBoardQuery;
}): JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [subprojectOpen, setSubprojectOpen] = useState(false);
  const [subprojectName, setSubprojectName] = useState("");

  useEffect(() => {
    void getAuthMe()
      .then((m) => setRole(m.role))
      .catch(() => setRole(null));
  }, []);

  const canEdit = role === "ADMIN" || role === "EDITOR";

  const createSubprojectMut = useMutation({
    mutationFn: (name: string) => createProject({ name, parentProjectId: project.id }),
    onSuccess: () => {
      toast.success("Subprojeto criado.");
      setSubprojectName("");
      setSubprojectOpen(false);
      void qc.invalidateQueries({ queryKey: queryKeys.projects });
      void qc.invalidateQueries({ queryKey: queryKeys.projectsDashboard });
      router.refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o subprojeto.");
    }
  });

  function submitSubproject(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = subprojectName.trim();
    if (!name) {
      toast.error("Informe o nome do subprojeto.");
      return;
    }
    createSubprojectMut.mutate(name);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/projetos"
          className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
        >
          ← Voltar aos projetos
        </Link>
        <span className="text-slate-300">|</span>
        <Link
          href={`/projetos/tarefas?projectId=${project.id}`}
          className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
        >
          Todas as tarefas deste projeto
        </Link>
      </div>

      <header>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{project.name}</h1>
            {project.parentProject ? (
              <p className="mt-1 text-xs text-slate-500">
                Subprojeto de{" "}
                <Link href={`/projetos/${project.parentProject.id}`} className="font-medium text-slate-700 underline underline-offset-2">
                  {project.parentProject.name}
                </Link>
              </p>
            ) : null}
          </div>
          {canEdit ? (
            <Button type="button" onClick={() => setSubprojectOpen(true)}>
              Novo subprojeto
            </Button>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Atualizado em {new Date(project.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </p>
      </header>

      {project.subprojects?.length ? (
        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Subprojetos vinculados</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{project.subprojects.length}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {project.subprojects.map((sub) => (
              <Link
                key={sub.id}
                href={`/projetos/${sub.id}`}
                className="rounded-lg border bg-background p-3 text-sm shadow-sm transition hover:border-primary/50 hover:bg-accent"
              >
                <span className="block font-semibold text-foreground">{sub.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {sub._count?.tasks ?? 0} tarefa(s) · atualizado em{" "}
                  {new Date(sub.updatedAt).toLocaleDateString("pt-BR")}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <ProjectTasksBoard projectId={project.id} groups={project.groups} boardQuery={boardQuery} />

      <Dialog open={subprojectOpen} onOpenChange={setSubprojectOpen}>
        <DialogContent>
          <form className="space-y-4" onSubmit={submitSubproject}>
            <DialogHeader>
              <DialogTitle>Novo subprojeto</DialogTitle>
              <DialogDescription>O subprojeto ficará vinculado a “{project.name}”.</DialogDescription>
            </DialogHeader>
            <label className="space-y-2 text-sm font-medium">
              <span>Nome do subprojeto</span>
              <Input
                value={subprojectName}
                onChange={(event) => setSubprojectName(event.target.value)}
                placeholder="Ex.: Fase 2 — implantação"
                disabled={createSubprojectMut.isPending}
                autoFocus
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSubprojectOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createSubprojectMut.isPending}>
                {createSubprojectMut.isPending ? "A guardar…" : "Criar subprojeto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
