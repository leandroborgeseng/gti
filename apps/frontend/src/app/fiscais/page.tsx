import { Card } from "@/components/ui/card";
import { FiscalForm } from "@/components/actions/fiscal-form";
import { getFiscais } from "@/lib/api";

export default async function FiscaisPage(): Promise<JSX.Element> {
  const fiscais = await getFiscais().catch(() => []);
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-semibold">Novo fiscal</h3>
        <FiscalForm />
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold">Fiscais e gestores</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2">ID</th>
                <th className="py-2">Nome</th>
                <th className="py-2">E-mail</th>
                <th className="py-2">Telefone</th>
                <th className="py-2">Como fiscal</th>
                <th className="py-2">Como gestor</th>
              </tr>
            </thead>
            <tbody>
              {fiscais.map((fiscal) => (
                <tr key={fiscal.id} className="border-b">
                  <td className="py-2 font-mono text-xs text-slate-500">{fiscal.id}</td>
                  <td className="py-2">{fiscal.name}</td>
                  <td className="py-2">{fiscal.email}</td>
                  <td className="py-2">{fiscal.phone}</td>
                  <td className="py-2">{fiscal.contractsAsFiscal?.length ?? 0}</td>
                  <td className="py-2">{fiscal.contractsAsManager?.length ?? 0}</td>
                </tr>
              ))}
              {fiscais.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
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
