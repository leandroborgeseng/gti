import { GoalsView } from "@/components/goals/goals-view";
import { getGoals, getProjects, getUsers } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export default async function GoalsPage(): Promise<JSX.Element> {
  const [gRes, uRes, pRes] = await Promise.all([safeLoad(() => getGoals(), []), safeLoad(() => getUsers(), []), safeLoad(() => getProjects(), [])]);
  const dataLoadErrors = collectLoadErrors([gRes.error, uRes.error, pRes.error]);
  return <GoalsView goals={gRes.data} users={uRes.data} projects={pRes.data} dataLoadErrors={dataLoadErrors} />;
}
