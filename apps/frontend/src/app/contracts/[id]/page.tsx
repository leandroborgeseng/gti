import { Card } from "@/components/ui/card";
import { getContract } from "@/lib/api";

export default async function ContractDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const contract = await getContract(params.id).catch(() => null);
  if (!contract) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Contrato não encontrado.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-semibold">
          {contract.number} - {contract.name}
        </h3>
        <p className="text-sm text-slate-600">
          {contract.companyName} | Tipo: {contract.contractType} | Status: {contract.status}
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Valor total: {contract.totalValue} | Valor mensal: {contract.monthlyValue} | Vigência até{" "}
          {new Date(contract.endDate).toLocaleDateString("pt-BR")}
        </p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 font-medium">Módulos e funcionalidades (SOFTWARE)</h4>
          {contract.modules && contract.modules.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {contract.modules.map((module) => (
                <li key={module.id}>
                  {module.name} (peso {module.weight}) - {module.features.length} funcionalidades
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Sem módulos cadastrados para este contrato.</p>
          )}
        </Card>
        <Card>
          <h4 className="mb-2 font-medium">Serviços (DATACENTER)</h4>
          {contract.services && contract.services.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {contract.services.map((service) => (
                <li key={service.id}>
                  {service.name} - unidade: {service.unit} - valor unitário: {service.unitValue}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Sem serviços cadastrados para este contrato.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
