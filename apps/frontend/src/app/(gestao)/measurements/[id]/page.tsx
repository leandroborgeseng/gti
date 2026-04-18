import { MeasurementAddServiceLines } from "@/components/measurements/measurement-add-service-lines";
import { MeasurementAttachments } from "@/components/measurements/measurement-attachments";
import { Card } from "@/components/ui/card";
import { MeasurementActions } from "@/components/actions/measurement-actions";
import { formatBrl } from "@/lib/format-brl";
import { getMeasurement } from "@/lib/api";

const statusLabel: Record<string, string> = {
  OPEN: "Aberta",
  UNDER_REVIEW: "Em revisão",
  APPROVED: "Aprovada",
  GLOSSED: "Glosada"
};

const contractTypeLabel: Record<string, string> = {
  SOFTWARE: "Software",
  DATACENTER: "Datacenter",
  INFRA: "Infraestrutura",
  SERVICO: "Serviço"
};

function calcRuleDescription(contractType: string | undefined): string {
  if (contractType === "DATACENTER" || contractType === "INFRA") {
    return "O cálculo soma as linhas da medição (serviços contratados): quantidade × valor unitário de cada serviço.";
  }
  if (contractType === "SOFTWARE" || contractType === "SERVICO") {
    return "O cálculo usa o valor mensal do contrato multiplicado pela proporção de funcionalidades em estado «Validada» sobre o total de funcionalidades.";
  }
  return "Consulte o tipo de contrato para saber qual regra de cálculo se aplica.";
}

export default async function MeasurementDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const measurement = await getMeasurement(params.id).catch(() => null);
  if (!measurement) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Medição não encontrada.</p>
      </Card>
    );
  }
  const tipo = measurement.contract?.contractType;
  const tipoLeg = tipo ? contractTypeLabel[tipo] ?? tipo : "—";
  const usedServiceIds =
    measurement.items?.filter((i) => i.type === "SERVICE").map((i) => i.referenceId) ?? [];
  const showAddLines =
    measurement.status === "OPEN" && (tipo === "DATACENTER" || tipo === "INFRA");

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-lg font-semibold text-slate-900">
          Medição {String(measurement.referenceMonth).padStart(2, "0")}/{measurement.referenceYear}
        </h3>
        <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          <p>
            <strong className="text-slate-900">Contrato:</strong> {measurement.contract?.name ?? measurement.contractId}
          </p>
          <p>
            <strong className="text-slate-900">Tipo de contrato:</strong> {tipoLeg}
          </p>
          <p>
            <strong className="text-slate-900">Status:</strong> {statusLabel[measurement.status] ?? measurement.status}
          </p>
        </div>
        <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <strong className="text-slate-800">Regra de cálculo:</strong> {calcRuleDescription(tipo)}
        </p>
      </Card>
      <Card className="p-5">
        <MeasurementActions measurementId={measurement.id} measurementStatus={measurement.status} />
      </Card>
      {showAddLines ? (
        <Card className="p-5">
          <h4 className="mb-1 font-medium text-slate-900">Linhas de consumo (serviços)</h4>
          <p className="text-sm text-slate-600">
            Adicione uma linha por serviço do contrato e quantidade consumida nesta competência. Depois use <strong className="font-medium text-slate-800">Calcular</strong>.
          </p>
          <MeasurementAddServiceLines
            measurementId={measurement.id}
            services={measurement.contract?.services ?? []}
            usedServiceIds={usedServiceIds}
          />
        </Card>
      ) : null}
      <Card className="p-5">
        <h4 className="mb-2 font-medium text-slate-900">Resumo financeiro</h4>
        <p className="text-sm text-slate-700">Valor medido: {formatBrl(measurement.totalMeasuredValue)}</p>
        <p className="text-sm text-slate-700">Valor aprovado: {formatBrl(measurement.totalApprovedValue)}</p>
        <p className="text-sm text-slate-700">Valor glosado: {formatBrl(measurement.totalGlosedValue)}</p>
      </Card>
      <Card className="p-5">
        <h4 className="mb-2 font-medium text-slate-900">Anexos</h4>
        <MeasurementAttachments measurementId={measurement.id} attachments={measurement.attachments ?? []} />
      </Card>
      <Card className="p-5">
        <h4 className="mb-2 font-medium text-slate-900">Itens da medição</h4>
        {measurement.items && measurement.items.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {measurement.items.map((item) => (
              <li key={item.id}>
                {item.type} | ref: {item.referenceId} | quantidade: {item.quantity} | valor: {formatBrl(item.calculatedValue)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            {tipo === "DATACENTER" || tipo === "INFRA"
              ? "Nenhum item cadastrado. Para datacenter/infra, inclua linhas de serviço (quantidades) antes de calcular."
              : "Nenhum item cadastrado. Para software/serviço, o valor vem das funcionalidades validadas na estrutura do contrato."}
          </p>
        )}
      </Card>
    </div>
  );
}
