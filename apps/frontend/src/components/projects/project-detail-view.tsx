import Link from "next/link";
import type { ProjectDetail, ProjectTaskTree } from "@/lib/api";

function TaskBlock({ task }: { task: ProjectTaskTree }): JSX.Element {
  return (
    <div className="rounded-md border border-slate-200/90 bg-white p-3 text-sm shadow-sm">
      <p className="font-medium text-slate-900">{task.title}</p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
        {task.status ? <span>Status: {task.status}</span> : null}
        {task.assigneeExternal ? <span>Pessoa: {task.assigneeExternal}</span> : null}
        {task.dueDate ? <span>Prazo: {new Date(task.dueDate).toLocaleDateString("pt-BR")}</span> : null}
        {task.effort != null && task.effort !== "" ? <span>Esforço: {task.effort}</span> : null}
        {task.internalResponsible ? <span>Resp. PMF: {task.internalResponsible}</span> : null}
      </div>
      {task.description ? <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{task.description}</p> : null}
      {task.children?.length ? (
        <ul className="mt-3 space-y-2 border-t border-slate-100 pt-2">
          {task.children.map((c) => (
            <li key={c.id}>
              <TaskBlock task={c} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ProjectDetailView({ project }: { project: ProjectDetail }): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/projetos"
          className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
        >
          ← Voltar aos projetos
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{project.name}</h1>
        <p className="mt-1 text-xs text-slate-500">
          Atualizado em {new Date(project.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {project.groups.map((g) => (
          <section key={g.id} className="rounded-lg border border-slate-200/90 bg-slate-50/50 p-4 shadow-sm">
            <h2 className="border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">{g.name}</h2>
            <div className="mt-3 space-y-3">
              {g.tasks.length === 0 ? <p className="text-xs text-slate-500">Sem tarefas neste grupo.</p> : null}
              {g.tasks.map((t) => (
                <TaskBlock key={t.id} task={t} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
