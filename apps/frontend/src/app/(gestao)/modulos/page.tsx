import { ModulesDeliveryView } from "@/components/modules/modules-delivery-view";
import { getModulesDeliveryOverview } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export default async function ModulosPage(): Promise<JSX.Element> {
  const { data, error } = await safeLoad(() => getModulesDeliveryOverview(), []);
  const dataLoadErrors = collectLoadErrors([error]);
  return <ModulesDeliveryView initialRows={data} dataLoadErrors={dataLoadErrors} />;
}
