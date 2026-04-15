import type { Route } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ContractForm } from "@/components/actions/contract-form";
import { getContracts } from "@/lib/api";

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativo",
  EXPIRED: "Encerrado",
  SUSPENDED: "Suspenso"
};

export default async function ContractsPage(): Promise<JSX.Element> {
  const contracts = await getContracts().catch(() => []);
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-semibold">Novo contrato</h3>
        <ContractForm />
      </Card>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Contratos cadastrados</h3>
          <span className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">{contracts.length} contratos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-slate-500">
                <th className="py-2">Número</th>
                <th className="py-2">Nome</th>
                <th className="py-2">Fornecedor</th>
                <th className="py-2">Valor mensal</th>
                <th className="py-2">Vigência</th>
                <th className="py-2">Status</th>
                <th className="py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-b border-border">
                  <td className="py-2">{c.number}</td>
                  <td className="py-2">{c.name}</td>
                  <td className="py-2">{c.supplier?.name ?? c.companyName}</td>
                  <td className="py-2">R$ {Number(c.monthlyValue).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-2">{new Date(c.endDate).toLocaleDateString("pt-BR")}</td>
                  <td className="py-2">{statusLabel[c.status] ?? c.status}</td>
                  <td className="py-2">
                    <Link href={`/contracts/${c.id}` as Route} className="text-blue-600 hover:underline">
                      Ver detalhes
                    </Link>
                  </td>
                </tr>
              ))}
              {contracts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    Nenhum contrato encontrado no backend.
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
