import Link from "next/link";
import type { ProjectDetail } from "@/lib/api";
import { ProjectTasksBoard } from "@/components/projects/project-tasks-board";

export type ProjectBoardQuery = { filter?: string; statusKind?: string; sort?: string };

export function ProjectDetailView({
  project,
  boardQuery
}: {
  project: ProjectDetail;
  boardQuery?: ProjectBoardQuery;
}): JSX.Element {
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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{project.name}</h1>
        {project.projectCollection ? (
          <p className="mt-1 text-xs text-slate-500">Grupo de projetos: {project.projectCollection.name}</p>
        ) : null}
        {project.supervisor ? (
          <p className="mt-1 text-xs text-slate-500">Supervisor do projeto: {project.supervisor.email}</p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Supervisor do projeto: não definido</p>
        )}
        <p className="mt-1 text-xs text-slate-500">
          Atualizado em {new Date(project.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </p>
      </header>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Contexto do projeto</h2>
        {project.context?.trim() ? (
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{project.context}</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhum contexto registrado. Use a edição do projeto para escrever a apresentação, o propósito e os pontos importantes desta iniciativa.
          </p>
        )}
      </section>

      {project.projectCollection?.projects?.length ? (
        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Outros projetos no mesmo grupo</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{project.projectCollection.projects.length}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {project.projectCollection.projects.map((related) => (
              <Link
                key={related.id}
                href={`/projetos/${related.id}`}
                className="rounded-lg border bg-background p-3 text-sm shadow-sm transition hover:border-primary/50 hover:bg-accent"
              >
                <span className="block font-semibold text-foreground">{related.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {related._count?.tasks ?? 0} tarefa(s) · atualizado em{" "}
                  {new Date(related.updatedAt).toLocaleDateString("pt-BR")}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <ProjectTasksBoard projectId={project.id} groups={project.groups} boardQuery={boardQuery} />
    </div>
  );
}
