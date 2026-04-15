import { Card } from "@/components/ui/card";

export default function MeasurementDetailPage({ params }: { params: { id: string } }): JSX.Element {
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-semibold">Medição {params.id}</h3>
        <p className="text-sm text-slate-600">Cálculo automático por tipo de contrato, aplicação de glosas e aprovação.</p>
      </Card>
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white">Calcular</button>
          <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white">Aprovar</button>
          <button className="rounded-lg border border-border bg-white px-3 py-2 text-sm">Adicionar anexo</button>
        </div>
        <p className="text-sm text-slate-700">Valor medido, valor glosado e valor final serão exibidos aqui.</p>
      </Card>
    </div>
  );
}
