import { MeasurementsView } from "@/components/measurements/measurements-view";
import { getContract, getContracts, getMeasurements } from "@/lib/api";

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
  const [measurements, filterLabel, contracts] = await Promise.all([
    getMeasurements().catch(() => []),
    contractId ? getContract(contractId).catch(() => null) : Promise.resolve(null),
    getContracts().catch(() => [])
  ]);

  const filterTitle = filterLabel ? `${filterLabel.number} — ${filterLabel.name}` : contractId ?? undefined;
  const contractOptions = contracts.map((c) => ({ id: c.id, number: c.number, name: c.name }));

  return (
    <MeasurementsView
      measurements={measurements}
      contractOptions={contractOptions}
      filterContractId={contractId}
      filterContractTitle={filterTitle}
    />
  );
}
