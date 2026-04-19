import { GovernanceTicketsView } from "@/components/governance/governance-tickets-view";
import { getContracts, getGovernanceTickets } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export default async function GovernanceTicketsPage(): Promise<JSX.Element> {
  const [tRes, cRes] = await Promise.all([
    safeLoad(() => getGovernanceTickets(), []),
    safeLoad(() => getContracts(), [])
  ]);
  const contractOptions = cRes.data.map((c) => ({ id: c.id, number: c.number, name: c.name }));
  const dataLoadErrors = collectLoadErrors([tRes.error, cRes.error]);
  return (
    <GovernanceTicketsView tickets={tRes.data} contractOptions={contractOptions} dataLoadErrors={dataLoadErrors} />
  );
}
