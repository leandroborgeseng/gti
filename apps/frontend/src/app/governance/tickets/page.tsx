import { GovernanceTicketsView } from "@/components/governance/governance-tickets-view";
import { getGovernanceTickets } from "@/lib/api";

export default async function GovernanceTicketsPage(): Promise<JSX.Element> {
  const tickets = await getGovernanceTickets().catch(() => []);
  return <GovernanceTicketsView tickets={tickets} />;
}
