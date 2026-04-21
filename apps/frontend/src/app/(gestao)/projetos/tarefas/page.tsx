import { Suspense } from "react";
import { AllProjectTasksView } from "@/components/projects/all-project-tasks-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ProjetosTarefasPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">A carregar filtros…</div>}>
      <AllProjectTasksView />
    </Suspense>
  );
}
