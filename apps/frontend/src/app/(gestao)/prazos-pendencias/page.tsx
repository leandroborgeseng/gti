import { DeadlinesView } from "@/components/deadlines/deadlines-view";
import { getDeadlines } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

const EMPTY = {
  items: [],
  summary: { totalOpen: 0, byStatus: {}, byOrigin: {}, byAttention: {} }
};

export default async function PrazosPendenciasPage(): Promise<JSX.Element> {
  const res = await safeLoad(() => getDeadlines(), EMPTY);
  const dataLoadErrors = collectLoadErrors([res.error]);
  return <DeadlinesView initial={res.data} dataLoadErrors={dataLoadErrors} />;
}
