import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getMeasurements } from "@/lib/api";

export default async function MeasurementsPage(): Promise<JSX.Element> {
  const rows = await getMeasurements().catch(() => []);
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Medições</h3>
        <span className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">{rows.length} medições</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-slate-500">
              <th className="py-2">Contrato</th>
              <th className="py-2">Referência</th>
              <th className="py-2">Status</th>
              <th className="py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="py-2">{r.contract?.name ?? r.contractId}</td>
                <td className="py-2">
                  {String(r.referenceMonth).padStart(2, "0")}/{r.referenceYear}
                </td>
                <td className="py-2">{r.status}</td>
                <td className="py-2">
                  <Link className="text-blue-600 hover:underline" href={`/measurements/${r.id}`}>
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-500">
                  Nenhuma medição encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
