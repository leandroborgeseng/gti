import { Card } from "@/components/ui/card";
import { MeasurementActions } from "@/components/actions/measurement-actions";
import { getMeasurement } from "@/lib/api";

export default async function MeasurementDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const measurement = await getMeasurement(params.id).catch(() => null);
  if (!measurement) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Medição não encontrada.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-semibold">
          Medição {String(measurement.referenceMonth).padStart(2, "0")}/{measurement.referenceYear}
        </h3>
        <p className="text-sm text-slate-600">Cálculo automático por tipo de contrato, aplicação de glosas e aprovação.</p>
        <p className="mt-2 text-sm text-slate-700">
          Contrato: {measurement.contract?.name ?? measurement.contractId} | Status: {measurement.status}
        </p>
      </Card>
      <Card>
        <MeasurementActions measurementId={measurement.id} />
      </Card>
      <Card>
        <h4 className="mb-2 font-medium">Resumo financeiro</h4>
        <p className="text-sm text-slate-700">Valor medido: {measurement.totalMeasuredValue}</p>
        <p className="text-sm text-slate-700">Valor aprovado: {measurement.totalApprovedValue}</p>
        <p className="text-sm text-slate-700">Valor glosado: {measurement.totalGlosedValue}</p>
      </Card>
      <Card>
        <h4 className="mb-2 font-medium">Itens da medição</h4>
        {measurement.items && measurement.items.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {measurement.items.map((item) => (
              <li key={item.id}>
                {item.type} | ref: {item.referenceId} | quantidade: {item.quantity} | valor: {item.calculatedValue}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Nenhum item cadastrado.</p>
        )}
      </Card>
    </div>
  );
}
