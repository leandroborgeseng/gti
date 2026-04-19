import { SuppliersView } from "@/components/suppliers/suppliers-view";
import { getSuppliers } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export default async function SuppliersPage(): Promise<JSX.Element> {
  const { data: suppliers, error } = await safeLoad(() => getSuppliers(), []);
  return <SuppliersView suppliers={suppliers} dataLoadErrors={collectLoadErrors([error])} />;
}
