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
        <p className="mt-1 text-xs text-slate-500">
          Atualizado em {new Date(project.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </p>
      </header>

      <ProjectTasksBoard projectId={project.id} groups={project.groups} boardQuery={boardQuery} />
    </div>
  );
}
