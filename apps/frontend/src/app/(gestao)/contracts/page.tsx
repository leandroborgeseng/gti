import { ContractsView } from "@/components/contracts/contracts-view";
import { getContracts } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export default async function ContractsPage(): Promise<JSX.Element> {
  const { data: contracts, error } = await safeLoad(() => getContracts(), []);
  const dataLoadErrors = collectLoadErrors([error]);
  return <ContractsView contracts={contracts} dataLoadErrors={dataLoadErrors} />;
}
