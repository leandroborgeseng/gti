import { Card } from "@/components/ui/card";
import { getContracts } from "@/lib/api";

export default async function SuppliersPage(): Promise<JSX.Element> {
  const contracts = await getContracts().catch(() => []);
  const suppliers = Array.from(
    new Map(
      contracts
        .filter((contract) => contract.supplier)
        .map((contract) => [contract.supplier!.id, { id: contract.supplier!.id, name: contract.supplier!.name, cnpj: contract.supplier!.cnpj }])
    ).values()
  );
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-semibold">Fornecedores</h3>
        <p className="text-sm text-slate-600">Lista consolidada a partir dos contratos cadastrados.</p>
      </Card>
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2">Nome</th>
                <th className="py-2">CNPJ</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-b">
                  <td className="py-2">{supplier.name}</td>
                  <td className="py-2">{supplier.cnpj}</td>
                </tr>
              ))}
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-6 text-center text-slate-500">
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
