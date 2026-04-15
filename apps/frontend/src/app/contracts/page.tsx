import Link from "next/link";
import { Card } from "@/components/ui/card";

const contracts = [
  { id: "c1", number: "CT-001/2025", name: "Plataforma Digital", supplier: "Aprova Digital", status: "ACTIVE" },
  { id: "c2", number: "CT-014/2024", name: "Infraestrutura Datacenter", supplier: "Tech Cloud", status: "ACTIVE" }
];

export default function ContractsPage(): JSX.Element {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Contratos</h3>
        <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white">Novo contrato</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-slate-500">
              <th className="py-2">Número</th>
              <th className="py-2">Nome</th>
              <th className="py-2">Fornecedor</th>
              <th className="py-2">Status</th>
              <th className="py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id} className="border-b border-border">
                <td className="py-2">{c.number}</td>
                <td className="py-2">{c.name}</td>
                <td className="py-2">{c.supplier}</td>
                <td className="py-2">{c.status}</td>
                <td className="py-2">
                  <Link href={`/contracts/${c.id}`} className="text-blue-600 hover:underline">
                    Ver detalhes
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
