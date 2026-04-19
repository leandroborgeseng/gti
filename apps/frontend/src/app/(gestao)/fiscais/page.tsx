import { FiscaisView } from "@/components/fiscais/fiscais-view";
import { getFiscais } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export default async function FiscaisPage(): Promise<JSX.Element> {
  const { data: fiscais, error } = await safeLoad(() => getFiscais(), []);
  return <FiscaisView fiscais={fiscais} dataLoadErrors={collectLoadErrors([error])} />;
}
