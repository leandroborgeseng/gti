import { GlosasView } from "@/components/glosas/glosas-view";
import { getGlosas } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export default async function GlosasPage(): Promise<JSX.Element> {
  const glRes = await safeLoad(() => getGlosas(), []);
  const dataLoadErrors = collectLoadErrors([glRes.error]);
  return <GlosasView glosas={glRes.data} dataLoadErrors={dataLoadErrors} />;
}
