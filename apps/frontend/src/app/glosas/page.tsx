import { GlosasView } from "@/components/glosas/glosas-view";
import { getGlosas } from "@/lib/api";

export default async function GlosasPage(): Promise<JSX.Element> {
  const glosas = await getGlosas().catch(() => []);
  return <GlosasView glosas={glosas} />;
}
