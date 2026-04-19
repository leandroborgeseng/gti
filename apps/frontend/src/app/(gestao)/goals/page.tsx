import { GoalsView } from "@/components/goals/goals-view";
import { getGoals, getUsers } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export default async function GoalsPage(): Promise<JSX.Element> {
  const [gRes, uRes] = await Promise.all([safeLoad(() => getGoals(), []), safeLoad(() => getUsers(), [])]);
  const dataLoadErrors = collectLoadErrors([gRes.error, uRes.error]);
  return <GoalsView goals={gRes.data} users={uRes.data} dataLoadErrors={dataLoadErrors} />;
}
