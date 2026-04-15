import Link from "next/link";
import { Card } from "@/components/ui/card";

const rows = [
  { id: "m1", contract: "CT-001/2025", ref: "04/2026", status: "UNDER_REVIEW" },
  { id: "m2", contract: "CT-014/2024", ref: "04/2026", status: "OPEN" }
];

export default function MeasurementsPage(): JSX.Element {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Medições</h3>
        <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white">Nova medição</button>
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
                <td className="py-2">{r.contract}</td>
                <td className="py-2">{r.ref}</td>
                <td className="py-2">{r.status}</td>
                <td className="py-2">
                  <Link className="text-blue-600 hover:underline" href={`/measurements/${r.id}`}>
                    Abrir
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
