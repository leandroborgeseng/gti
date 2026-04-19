import { GlosasView } from "@/components/glosas/glosas-view";
import { getGlosas, getMeasurements } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export default async function GlosasPage(): Promise<JSX.Element> {
  const [glRes, meRes] = await Promise.all([
    safeLoad(() => getGlosas(), []),
    safeLoad(() => getMeasurements(), [])
  ]);
  const glosas = glRes.data;
  const measurements = meRes.data;
  const dataLoadErrors = collectLoadErrors([glRes.error, meRes.error]);
  const measurementOptions = measurements.map((m) => {
    const c = m.contract;
    const label = c
      ? `${String(m.referenceMonth).padStart(2, "0")}/${m.referenceYear} · ${c.number ?? ""} ${c.name}`.trim()
      : `${String(m.referenceMonth).padStart(2, "0")}/${m.referenceYear} · ${m.contractId.slice(0, 8)}…`;
    return { id: m.id, label };
  });
  return <GlosasView glosas={glosas} measurementOptions={measurementOptions} dataLoadErrors={dataLoadErrors} />;
}
