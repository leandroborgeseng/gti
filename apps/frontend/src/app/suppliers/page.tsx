import { Card } from "@/components/ui/card";
import { SupplierForm } from "@/components/actions/supplier-form";
import { getSuppliers } from "@/lib/api";

export default async function SuppliersPage(): Promise<JSX.Element> {
  const suppliers = await getSuppliers().catch(() => []);
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-semibold">Novo fornecedor</h3>
        <SupplierForm />
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold">Fornecedores cadastrados</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2">ID</th>
                <th className="py-2">Nome</th>
                <th className="py-2">CNPJ</th>
                <th className="py-2">Contratos vinculados</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-b">
                  <td className="py-2 font-mono text-xs text-slate-500">{supplier.id}</td>
                  <td className="py-2">{supplier.name}</td>
                  <td className="py-2">{supplier.cnpj}</td>
                  <td className="py-2">{supplier.contracts?.length ?? 0}</td>
                </tr>
              ))}
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">
                    Nenhum fornecedor vinculado a contratos.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
