import { GoalsView } from "@/components/goals/goals-view";
import { getGoals } from "@/lib/api";

export default async function GoalsPage(): Promise<JSX.Element> {
  const goals = await getGoals().catch(() => []);
  return <GoalsView goals={goals} />;
}
