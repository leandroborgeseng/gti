"use client";

import dynamic from "next/dynamic";
import type { Goal, ProjectGroupWithTasks } from "@/lib/api";

export type ProjectBoardQuery = { filter?: string; statusKind?: string; sort?: string };

const ProjectTasksBoard = dynamic(
  () =>
    import("@/components/projects/project-tasks-board").then((m) => ({
      default: m.ProjectTasksBoard
    })),
  {
    ssr: false,
    loading: () => (
      <p className="py-10 text-center text-sm text-muted-foreground">Carregando quadro de tarefas…</p>
    )
  }
);

type Props = {
  projectId: string;
  groups: ProjectGroupWithTasks[];
  goals: Goal[];
  boardQuery?: ProjectBoardQuery;
};

/** Carrega o quadro pesado só no cliente, após o shell do projeto. */
export function ProjectTasksBoardLazy({ projectId, groups, goals, boardQuery }: Props): JSX.Element {
  return <ProjectTasksBoard projectId={projectId} groups={groups} goals={goals} boardQuery={boardQuery} />;
}
