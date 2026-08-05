import Link from "next/link";
import { MeasurementAddServiceLines } from "@/components/measurements/measurement-add-service-lines";
import { MeasurementItemsStateful } from "@/components/measurements/measurement-items-stateful";
import { MeasurementAttachments } from "@/components/measurements/measurement-attachments";
import { MeasurementGlosasPanel } from "@/components/measurements/measurement-glosas-panel";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { MeasurementActions } from "@/components/actions/measurement-actions";
import { formatBrl } from "@/lib/format-brl";
import { getMeasurement } from "@/lib/api";
import { safeLoadNullable } from "@/lib/api-load";
import { gestaoMayMutateAttachments } from "@/lib/session-role-server";

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

function measurementItemsSnapshotKey(measurement: {
  id: string;
  updatedAt?: string;
  status: string;
  totalMeasuredValue: string;
  totalApprovedValue: string;
  items?: Array<{ id: string; pricingItemId?: string | null; quantity: string; calculatedValue: string }>;
}): string {
  const lines = (measurement.items ?? []).map((i) => `${i.id}:${i.pricingItemId ?? ""}:${i.quantity}:${i.calculatedValue}`).join("|");
  return [
    measurement.id,
    measurement.updatedAt ?? "",
    measurement.status,
    measurement.totalMeasuredValue,
    measurement.totalApprovedValue,
    lines
  ].join("¦");
}

function formatDateUtc(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formalLabel(contract?: {
  formalNumber?: string | null;
  contractYear?: number | null;
  number?: string;
} | null): string {
  if (!contract) return "-";
  if (contract.formalNumber && contract.contractYear) {
    return `${contract.formalNumber}/${contract.contractYear}`;
  }
  return contract.number ?? "-";
}

export default async function MeasurementDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const { data: measurement, error } = await safeLoadNullable(() => getMeasurement(params.id));
  if (error) {
    return (
      <div className="space-y-4">
        <DataLoadAlert messages={[error]} title="Não foi possível carregar a medição" />
        <p className="text-sm">
          <Link
            href="/measurements"
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
          >
            Voltar à lista de medições
          </Link>
        </p>
      </div>
    );
  }
  if (!measurement) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Medição não encontrada.</p>
      </Card>
    );
  }
  const tipo = measurement.contract?.contractType;
  const tipoLeg = tipo ? contractTypeLabel[tipo] ?? tipo : "-";
  const usedServiceIds =
    measurement.items?.filter((i) => i.type === "SERVICE").map((i) => i.referenceId) ?? [];
  const showAddLines =
    measurement.status === "OPEN" && (tipo === "DATACENTER" || tipo === "INFRA");
  const mayMutateAnexos = await gestaoMayMutateAttachments();
  const summary = measurement.financialSummary;
  const gross = summary?.gross ?? measurement.totalMeasuredValue;
  const autoGlosas = summary?.automaticGlosas ?? "0";
  const manualGlosas = summary?.manualGlosas ?? "0";
  const net = summary?.net ?? measurement.totalApprovedValue;
  const orgLabel = measurement.contract?.organization
    ? `${measurement.contract.organization.acronym} · ${measurement.contract.organization.name}`
    : "-";
  const supplierLabel =
    measurement.contract?.supplier?.name ?? measurement.contract?.companyName ?? "-";
  const itemOptions = (measurement.items ?? []).map((item) => ({
    id: item.id,
    label:
      item.descriptionSnapshot ||
      item.pricingItem?.description ||
      (item.isLegacyMonthly ? "Mensalidade legada" : item.referenceId)
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link
          href="/measurements"
          className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
        >
          ← Medições
        </Link>
      </p>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Medição {String(measurement.referenceMonth).padStart(2, "0")}/{measurement.referenceYear}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Status:{" "}
              <span className="font-medium text-slate-900">
                {statusLabel[measurement.status] ?? measurement.status}
              </span>
            </p>
          </div>
          <MeasurementActions measurementId={measurement.id} measurementStatus={measurement.status} />
        </div>
        <div className="mt-4 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          <p>
            <strong className="text-slate-900">Código interno:</strong>{" "}
            {measurement.contract?.internalCode ?? "-"}
          </p>
          <p>
            <strong className="text-slate-900">Número formal:</strong> {formalLabel(measurement.contract)}
          </p>
          <p>
            <strong className="text-slate-900">Contrato:</strong>{" "}
            <Link
              href={`/contracts/${measurement.contractId}`}
              className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900"
            >
              {measurement.contract?.name ?? measurement.contractId}
            </Link>
          </p>
          <p>
            <strong className="text-slate-900">Tipo:</strong> {tipoLeg}
          </p>
          <p>
            <strong className="text-slate-900">Órgão:</strong> {orgLabel}
          </p>
          <p>
            <strong className="text-slate-900">Fornecedor:</strong> {supplierLabel}
          </p>
          <p>
            <strong className="text-slate-900">Competência:</strong>{" "}
            {String(measurement.referenceMonth).padStart(2, "0")}/{measurement.referenceYear}
          </p>
          <p>
            <strong className="text-slate-900">Vigência do contrato:</strong>{" "}
            {formatDateUtc(measurement.contract?.startDate)} a {formatDateUtc(measurement.contract?.endDate)}
          </p>
        </div>
        <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <strong className="text-slate-800">Composição:</strong> as linhas são geradas automaticamente a
          partir dos itens contratuais vigentes na competência (com proporção por dias quando a vigência é
          parcial). Informe quantidades em itens sob demanda ou únicos e use «Calcular medição».
        </p>
      </Card>

      {showAddLines ? (
        <Card className="p-5">
          <h4 className="mb-1 font-medium text-slate-900">Linhas de consumo (serviços)</h4>
          <p className="text-sm text-slate-600">
            Adicione uma linha por serviço do contrato e quantidade consumida nesta competência. Depois use{" "}
            <strong className="font-medium text-slate-800">Calcular medição</strong>.
          </p>
          <MeasurementAddServiceLines
            measurementId={measurement.id}
            services={measurement.contract?.services ?? []}
            usedServiceIds={usedServiceIds}
            pricingItems={measurement.contract?.pricingItems ?? []}
          />
        </Card>
      ) : null}

      <Card className="p-5">
        <h4 className="mb-2 font-medium text-slate-900">Itens da medição</h4>
        {!(measurement.items && measurement.items.length > 0) ? (
          <p className="text-sm text-slate-500">
            Nenhum item na medição. Contratos sem itens vigentes na competência precisam ter a precificação
            cadastrada antes de criar a medição.
          </p>
        ) : null}
        <MeasurementItemsStateful
          measurementId={measurement.id}
          measurementStatus={measurement.status}
          serverSnapshotKey={measurementItemsSnapshotKey(measurement)}
          items={measurement.items ?? []}
        />
      </Card>

      <Card className="p-5">
        <h4 className="mb-2 font-medium text-slate-900">Glosas e descontos</h4>
        <p className="mb-3 text-sm text-slate-600">
          Glosas automáticas vêm do cálculo (funcionalidades não validadas). Glosas manuais exigem
          justificativa e entram no líquido da medição.
        </p>
        <MeasurementGlosasPanel
          measurementId={measurement.id}
          measurementStatus={measurement.status}
          glosas={measurement.glosas ?? []}
          itemOptions={itemOptions}
        />
      </Card>

      <Card className="p-5">
        <h4 className="mb-2 font-medium text-slate-900">Anexos</h4>
        <MeasurementAttachments
          measurementId={measurement.id}
          attachments={measurement.attachments ?? []}
          canMutate={mayMutateAnexos}
        />
      </Card>

      <Card className="sticky bottom-2 border-slate-300 bg-white/95 p-5 shadow-sm backdrop-blur">
        <h4 className="mb-2 font-medium text-slate-900">Resumo financeiro</h4>
        <div className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
          <p>
            Valor bruto: <span className="tabular-nums font-medium text-slate-900">{formatBrl(gross)}</span>
          </p>
          <p>
            Glosas automáticas:{" "}
            <span className="tabular-nums font-medium text-slate-900">{formatBrl(autoGlosas)}</span>
          </p>
          <p>
            Glosas manuais:{" "}
            <span className="tabular-nums font-medium text-slate-900">{formatBrl(manualGlosas)}</span>
          </p>
          <p>
            Valor glosado (total):{" "}
            <span className="tabular-nums font-medium text-slate-900">
              {formatBrl(measurement.totalGlosedValue)}
            </span>
          </p>
          <p className="sm:col-span-2">
            Líquido (≥ 0):{" "}
            <span className="tabular-nums text-base font-semibold text-slate-900">{formatBrl(net)}</span>
          </p>
        </div>
      </Card>
    </div>
  );
}
