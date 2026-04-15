import { Card } from "@/components/ui/card";

export default function ContractDetailPage({ params }: { params: { id: string } }): JSX.Element {
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-semibold">Contrato {params.id}</h3>
        <p className="text-sm text-slate-600">Detalhe geral do contrato, dados financeiros, vigência e responsáveis.</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 font-medium">Módulos e funcionalidades (SOFTWARE)</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Módulo Atendimento (peso 40%)</li>
            <li>Módulo Fiscalização (peso 35%)</li>
            <li>Módulo Integrações (peso 25%)</li>
          </ul>
        </Card>
        <Card>
          <h4 className="mb-2 font-medium">Serviços (DATACENTER)</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>VMs — unidade: VM — valor unitário R$ 450,00</li>
            <li>Banco Gerenciado — unidade: GB — valor unitário R$ 1,20</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
