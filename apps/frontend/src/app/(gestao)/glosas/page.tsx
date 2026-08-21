import { GlosasView } from "@/components/glosas/glosas-view";
import { getGlosas } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export default async function GlosasPage(): Promise<JSX.Element> {
  const glRes = await safeLoad(
    () => getGlosas({ page: 1, pageSize: 25 }),
    { items: [], total: 0, page: 1, pageSize: 25, pageCount: 0 }
  );
  const dataLoadErrors = collectLoadErrors([glRes.error]);
  return <GlosasView initialPage={glRes.data} dataLoadErrors={dataLoadErrors} />;
}
