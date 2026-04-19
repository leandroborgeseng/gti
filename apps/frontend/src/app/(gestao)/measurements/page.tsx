import { MeasurementsView } from "@/components/measurements/measurements-view";
import { getContract, getContracts, getMeasurements } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

function pickContractId(raw: string | string[] | undefined): string | undefined {
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  if (Array.isArray(raw) && raw[0]) {
    return String(raw[0]).trim();
  }
  return undefined;
}

export default async function MeasurementsPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const contractId = pickContractId(searchParams?.contractId);
  const [meRes, filterRes, coRes] = await Promise.all([
    safeLoad(() => getMeasurements(), []),
    contractId ? safeLoad(() => getContract(contractId), null as Awaited<ReturnType<typeof getContract>> | null) : Promise.resolve({ data: null, error: null as string | null }),
    safeLoad(() => getContracts(), [])
  ]);

  const filterLabel = filterRes.data;
  const filterTitle = filterLabel ? `${filterLabel.number} — ${filterLabel.name}` : contractId ?? undefined;
  const contractOptions = coRes.data.map((c) => ({ id: c.id, number: c.number, name: c.name }));
  const dataLoadErrors = collectLoadErrors([meRes.error, filterRes.error, coRes.error]);

  return (
    <MeasurementsView
      measurements={meRes.data}
      contractOptions={contractOptions}
      filterContractId={contractId}
      filterContractTitle={filterTitle}
      dataLoadErrors={dataLoadErrors}
    />
  );
}
