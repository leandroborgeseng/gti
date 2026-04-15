import { Card } from "@/components/ui/card";
import { getContracts } from "@/lib/api";

export default async function FiscaisPage(): Promise<JSX.Element> {
  const contracts = await getContracts().catch(() => []);
  const fiscais = Array.from(
    new Map(
      contracts
        .flatMap((contract) => [contract.fiscal, contract.manager].filter(Boolean))
        .map((user) => [user!.id, { id: user!.id, name: user!.name, email: user!.email }])
    ).values()
  );
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-semibold">Fiscais e gestores</h3>
        <p className="text-sm text-slate-600">Responsáveis extraídos dos contratos ativos.</p>
      </Card>
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2">Nome</th>
                <th className="py-2">E-mail</th>
              </tr>
            </thead>
            <tbody>
              {fiscais.map((fiscal) => (
                <tr key={fiscal.id} className="border-b">
                  <td className="py-2">{fiscal.name}</td>
                  <td className="py-2">{fiscal.email}</td>
                </tr>
              ))}
              {fiscais.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-6 text-center text-slate-500">
                    Nenhum fiscal/gestor encontrado.
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
