import { ProjectDetailView, type ProjectBoardQuery } from "@/components/projects/project-detail-view";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { getProject } from "@/lib/api";
import { safeLoadNullable } from "@/lib/api-load";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function firstSearchParam(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function ProjetoDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const boardQuery: ProjectBoardQuery = {
    filter: firstSearchParam(searchParams.filter) || undefined,
    statusKind: firstSearchParam(searchParams.statusKind) || undefined,
    sort: firstSearchParam(searchParams.sort) || undefined
  };
  const { data: project, error } = await safeLoadNullable(() => getProject(params.id));
  if (error) {
    return (
      <div className="space-y-4">
        <DataLoadAlert messages={[error]} title="Não foi possível carregar o projeto" />
        <p className="text-sm">
          <Link
            href="/projetos"
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
          >
            Voltar à lista de projetos
          </Link>
        </p>
      </div>
    );
  }
  if (!project) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">Projeto não encontrado.</p>
      </Card>
    );
  }
  return <ProjectDetailView project={project} boardQuery={boardQuery} />;
}
