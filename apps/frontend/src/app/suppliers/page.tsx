import { SuppliersView } from "@/components/suppliers/suppliers-view";
import { getSuppliers } from "@/lib/api";

export default async function SuppliersPage(): Promise<JSX.Element> {
  const suppliers = await getSuppliers().catch(() => []);
  return <SuppliersView suppliers={suppliers} />;
}
