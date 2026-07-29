import { ModulesDeliveryView } from "@/components/modules/modules-delivery-view";
import { getAuthMe, getModulesDeliveryOverview } from "@/lib/api";
import { collectLoadErrors, safeLoad, safeLoadNullable } from "@/lib/api-load";

export default async function ModulosPage(): Promise<JSX.Element> {
  const [overviewRes, meRes] = await Promise.all([
    safeLoad(() => getModulesDeliveryOverview(), []),
    safeLoadNullable(() => getAuthMe())
  ]);
  const dataLoadErrors = collectLoadErrors([overviewRes.error, meRes.error]);
  const role = meRes.data?.role;
  const userRole = role === "ADMIN" || role === "EDITOR" || role === "VIEWER" ? role : undefined;

  return (
    <ModulesDeliveryView
      initialRows={overviewRes.data}
      dataLoadErrors={dataLoadErrors}
      userRole={userRole}
    />
  );
}
