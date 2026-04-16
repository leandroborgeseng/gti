import { ContractsView } from "@/components/contracts/contracts-view";
import { getContracts } from "@/lib/api";

export default async function ContractsPage(): Promise<JSX.Element> {
  const contracts = await getContracts().catch(() => []);
  return <ContractsView contracts={contracts} />;
}
