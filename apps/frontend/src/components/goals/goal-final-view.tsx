"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Goal, ProjectFlatTaskRow, ProjectListItem } from "@/lib/api";
import { patchProjectTask, updateGoal } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusLabel: Record<string, string> = {
  PLANNED: "Planejada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída"
};

type Props = {
  goal: Goal;
  projects: ProjectListItem[];
  tasks: ProjectFlatTaskRow[];
};

export function GoalFinalView({ goal, projects, tasks }: Props): JSX.Element {
  const router = useRouter();
  const [definition, setDefinition] = useState(goal.description ?? "");
  const [projectId, setProjectId] = useState(goal.projectId ?? "");
  const [taskFilter, setTaskFilter] = useState("");
  const [savingDefinition, setSavingDefinition] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  const linkedTaskIds = useMemo(() => new Set((goal.projectTasks ?? []).map((task) => task.id)), [goal.projectTasks]);
  const linkedTasks = goal.projectTasks ?? [];
  const average = goal.calculatedProgress ?? 0;
  const normalizedFilter = taskFilter.trim().toLowerCase();
  const filteredTasks = useMemo(() => {
    if (!normalizedFilter) return tasks.slice(0, 80);
    return tasks
      .filter((task) =>
        [task.title, task.projectName, task.groupName, task.status, task.goalTitle ?? ""].some((value) =>
          value.toLowerCase().includes(normalizedFilter)
        )
      )
      .slice(0, 80);
  }, [normalizedFilter, tasks]);

  const saveGoal = async (): Promise<void> => {
    setSavingDefinition(true);
    try {
      await updateGoal(goal.id, {
        description: definition.trim() || null,
        projectId: projectId || null
      });
      toast.success("Meta atualizada.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a meta.");
    } finally {
      setSavingDefinition(false);
    }
  };

  const toggleTask = async (task: ProjectFlatTaskRow, checked: boolean): Promise<void> => {
    setSavingTaskId(task.id);
    try {
      await patchProjectTask(task.projectId, task.id, { goalId: checked ? goal.id : null });
      toast.success(checked ? "Tarefa vinculada à meta." : "Tarefa removida da meta.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a tarefa.");
    } finally {
      setSavingTaskId(null);
    }
  };

  return (
    <div className="gti-exec-metric-dash gti-gestao-page space-y-5">
      <header className="page-header">
        <p className="page-kicker">
          <Link href={"/goals" as Route}>Metas estratégicas</Link>
          <span aria-hidden> · </span>
          <span>Tela final</span>
        </p>
        <h1 className="page-title">{goal.title}</h1>
        <p className="page-lead">
          Status <strong>{statusLabel[goal.status] ?? goal.status}</strong>, progresso agregado{" "}
          <strong className="tabular-nums">{average}%</strong>, ano <strong className="tabular-nums">{goal.year}</strong>.
        </p>
      </header>

      <section className="gestao-surface-card space-y-4">
        <div>
          <h2 className="m-0 text-base font-bold tracking-tight text-[var(--ink)]">Definição da meta</h2>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Descreva exatamente o que esta meta representa e como deve ser interpretada.</p>
        </div>
        <textarea
          className="min-h-[180px] w-full resize-y rounded-md border border-input bg-background p-3 text-sm leading-relaxed shadow-sm"
          value={definition}
          onChange={(event) => setDefinition(event.target.value)}
          placeholder="Escreva a definição completa da meta..."
        />
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="space-y-2 text-sm font-medium">
            <span>Projeto vinculado (opcional)</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">Sem projeto inteiro vinculado</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" disabled={savingDefinition} onClick={() => void saveGoal()}>
            {savingDefinition ? "Salvando..." : "Salvar definição"}
          </Button>
        </div>
      </section>

      <section className="gestao-surface-card space-y-4">
        <div>
          <h2 className="m-0 text-base font-bold tracking-tight text-[var(--ink)]">Tarefas vinculadas à meta</h2>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Vincule uma ou várias tarefas, mesmo que estejam em projetos diferentes.
          </p>
        </div>
        <Input value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)} placeholder="Pesquisar tarefa, projeto, grupo ou status..." />
        <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-12 p-2">Usar</th>
                <th className="p-2">Tarefa</th>
                <th className="p-2">Projeto</th>
                <th className="p-2">Status</th>
                <th className="p-2">Chamado</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => {
                const checked = linkedTaskIds.has(task.id);
                const busy = savingTaskId === task.id;
                return (
                  <tr key={task.id} className="border-t border-slate-100">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={(event) => void toggleTask(task, event.target.checked)}
                      />
                    </td>
                    <td className="p-2 font-medium text-slate-900">{task.title}</td>
                    <td className="p-2 text-slate-600">
                      <Link href={`/projetos/${task.projectId}` as Route} className="hover:underline">
                        {task.projectName}
                      </Link>
                    </td>
                    <td className="p-2 text-slate-600">{task.status || "sem status"}</td>
                    <td className="p-2 text-slate-600">{task.glpiTicketId ? `#${task.glpiTicketId}` : "—"}</td>
                  </tr>
                );
              })}
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-slate-500">
                    Nenhuma tarefa encontrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="gestao-surface-card">
        <h2 className="m-0 text-base font-bold tracking-tight text-[var(--ink)]">Resumo atual</h2>
        <ul className="mt-4 list-none space-y-3 p-0">
          {linkedTasks.map((task) => (
            <li key={task.id} className="rounded-[var(--radius-md)] border border-slate-200/90 bg-slate-50/80 p-3 text-sm shadow-sm">
              <Link href={`/projetos/${task.projectId}` as Route} className="font-semibold text-[var(--ink)] hover:underline">
                {task.title}
              </Link>
              <p className="mt-1 text-[var(--ink-muted)]">Projeto: {task.project?.name ?? task.projectId}</p>
              <p className="mt-0.5 text-[var(--ink-muted)]">
                Chamado: {task.glpiTicketId ? `#${task.glpiTicketId}` : "não vinculado"}
              </p>
            </li>
          ))}
          {linkedTasks.length === 0 ? <p className="m-0 text-sm text-[var(--ink-muted)]">Nenhuma tarefa vinculada a esta meta.</p> : null}
        </ul>
      </section>
    </div>
  );
}
