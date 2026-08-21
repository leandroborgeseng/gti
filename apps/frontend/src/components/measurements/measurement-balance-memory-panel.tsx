import { formatBrl } from "@/lib/format-brl";
import type { Measurement } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Props = {
  measurement: Measurement;
};

/**
 * Memória de saldo e snapshot de entrega na data de corte (tickets 98 / evolução).
 */
export function MeasurementBalanceMemoryPanel({ measurement }: Props): JSX.Element | null {
  const memory = measurement.balanceMemory;
  const snapshot = measurement.featureDeliverySnapshot;
  const lines = memory?.lines ?? [];
  const features = snapshot?.features ?? [];
  const asOf =
    measurement.referenceDate?.slice(0, 10) ||
    memory?.asOf ||
    snapshot?.asOf ||
    null;

  if (lines.length === 0 && features.length === 0 && !asOf) {
    return (
      <Card className="p-5">
        <h4 className="mb-1 font-medium text-slate-900">Memória de saldo e entrega</h4>
        <p className="text-sm text-slate-600">
          Ainda não há memória registrada. Use «Calcular medição» para gerar o saldo por item e o snapshot das
          funcionalidades na data de corte.
        </p>
      </Card>
    );
  }

  const measurable = features.filter((f) => !f.excludedFromCalculation);
  const excluded = features.filter((f) => f.excludedFromCalculation);

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h4 className="font-medium text-slate-900">Memória de saldo e entrega</h4>
        <p className="mt-1 text-sm text-slate-600">
          Situação na data de corte{" "}
          <strong className="font-medium text-slate-800">{asOf ?? "—"}</strong>
          {measurement.status === "APPROVED" ? (
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
              Congelada (medição aprovada)
            </span>
          ) : null}
          . Sequência: Contratado → Já medido/aprovado → Saldo → Consumo aprovado não medido → Medição atual.
        </p>
      </div>

      {lines.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Contratado</TableHead>
                <TableHead className="text-right">Já medido</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Consumo n/med.</TableHead>
                <TableHead className="text-right">Medição atual</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.pricingItemId}>
                  <TableCell className="max-w-[16rem]">
                    <span className="font-medium text-slate-900">{line.description}</span>
                    {line.billingKind ? (
                      <span className="mt-0.5 block text-[11px] text-slate-500">{line.billingKind}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtQty(line.contractedQuantity)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtQty(line.alreadyMeasuredApproved)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtQty(line.availableBalance)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtQty(line.approvedConsumptionNotMeasured)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtQty(line.currentMeasurementQuantity)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBrl(line.grossValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {measurable.length > 0 || excluded.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">
            Funcionalidades na data de corte · {measurable.length} consideradas
            {excluded.length > 0 ? ` · ${excluded.length} não se aplicam` : ""}
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-700">
            {measurable.slice(0, 80).map((f) => (
              <li key={f.featureId} className="flex flex-wrap justify-between gap-2">
                <span>
                  {f.itemCode ? <span className="font-medium text-slate-500">{f.itemCode} · </span> : null}
                  {f.name}
                </span>
                <span className="tabular-nums text-slate-600">
                  {deliveryStatusLabel(f.deliveryStatusAsOf ?? f.deliveryStatus)}
                  {(f.deliveryStatusAsOf ?? f.deliveryStatus) === "PARTIALLY_DELIVERED" &&
                  (f.percentAsOf ?? f.partialDeliveryPercent) != null
                    ? ` · ${f.percentAsOf ?? f.partialDeliveryPercent}%`
                    : ""}
                  {typeof f.fractionAsOf === "number"
                    ? ` · ${(f.fractionAsOf * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% no corte`
                    : ""}
                </span>
              </li>
            ))}
            {measurable.length > 80 ? (
              <li className="text-slate-500">… e mais {measurable.length - 80} itens</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function deliveryStatusLabel(status?: string): string {
  switch (status) {
    case "DELIVERED":
      return "Entregue";
    case "PARTIALLY_DELIVERED":
      return "Parcialmente entregue";
    case "NOT_DELIVERED":
      return "Não entregue";
    default:
      return status || "—";
  }
}
