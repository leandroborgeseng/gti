import { ContractStructureEditor } from "@/components/contracts/contract-structure-editor";
import { Card } from "@/components/ui/card";
import { getContract } from "@/lib/api";

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativo",
  EXPIRED: "Encerrado",
  SUSPENDED: "Suspenso"
};

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
        <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          <p><strong>Fornecedor:</strong> {contract.companyName}</p>
          <p><strong>Status:</strong> {statusLabel[contract.status] ?? contract.status}</p>
          <p><strong>Tipo:</strong> {contract.contractType}</p>
          <p><strong>Vigência final:</strong> {new Date(contract.endDate).toLocaleDateString("pt-BR")}</p>
          <p><strong>Valor mensal:</strong> R$ {Number(contract.monthlyValue).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p><strong>Valor total:</strong> R$ {Number(contract.totalValue).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </Card>
      <ContractStructureEditor contract={contract} />
    </div>
  );
}
