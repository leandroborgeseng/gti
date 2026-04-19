import { ProjectsListView } from "@/components/projects/projects-list-view";
import { getProjects } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProjetosPage(): Promise<JSX.Element> {
  const { data: projects, error } = await safeLoad(() => getProjects(), []);
  return <ProjectsListView projects={projects} dataLoadErrors={collectLoadErrors([error])} />;
}
