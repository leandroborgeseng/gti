import { FiscaisView } from "@/components/fiscais/fiscais-view";
import { getFiscais } from "@/lib/api";

export default async function FiscaisPage(): Promise<JSX.Element> {
  const fiscais = await getFiscais().catch(() => []);
  return <FiscaisView fiscais={fiscais} />;
}
