import { ProjectDetailView } from "@/components/projects/project-detail-view";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { getProject } from "@/lib/api";
import { safeLoadNullable } from "@/lib/api-load";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProjetoDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
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
  return <ProjectDetailView project={project} />;
}
