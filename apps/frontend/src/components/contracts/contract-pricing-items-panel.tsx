import { Card } from "@/components/ui/card";
import { formatBrl } from "@/lib/format-brl";
import type { Contract, ContractPricingBillingKind, ContractPricingPeriodicity } from "@/lib/api";

const BILLING: Record<ContractPricingBillingKind, string> = {
  RECURRING: "Recorrente",
  ONE_TIME: "Valor único",
  ON_DEMAND: "Sob demanda"
};

const PERIOD: Record<ContractPricingPeriodicity, string> = {
  MONTHLY: "Mensal",
  BIMONTHLY: "Bimestral",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual",
  CUSTOM: "Outra"
};

type Props = {
  contract: Contract;
};

export function ContractPricingItemsPanel({ contract }: Props): JSX.Element {
  const items = contract.pricingItems ?? [];
  const totals = contract.pricingTotals;

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-slate-900">Itens contratuais</h2>
      <p className="mt-1 text-sm text-slate-600">
        Precificação dinâmica do contrato (mensalidade, implantação, horas, UST, equipamentos e demais itens).
      </p>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Nenhum item de precificação cadastrado.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2 font-semibold">#</th>
                <th className="px-2 py-2 font-semibold">Tipo</th>
                <th className="px-2 py-2 font-semibold">Descrição</th>
                <th className="px-2 py-2 font-semibold">Qtd.</th>
                <th className="px-2 py-2 font-semibold">Unidade</th>
                <th className="px-2 py-2 font-semibold">Unitário</th>
                <th className="px-2 py-2 font-semibold">Total</th>
                <th className="px-2 py-2 font-semibold">Cobrança</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-slate-100 ${item.status === "CANCELLED" ? "opacity-60" : ""}`}
                >
                  <td className="px-2 py-2 align-top text-slate-700">{item.sequence}</td>
                  <td className="px-2 py-2 align-top text-slate-800">{item.type?.label ?? "—"}</td>
                  <td className="max-w-xs px-2 py-2 align-top text-slate-700">
                    <p className="line-clamp-3 whitespace-pre-wrap">{item.description}</p>
                    {item.status === "CANCELLED" ? (
                      <p className="mt-1 text-xs font-medium text-amber-800">Cancelado</p>
                    ) : null}
                    {item.includeInGlosaBase ? (
                      <p className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                        Base de glosa
                      </p>
                    ) : null}
                    {item.totalManual && item.totalJustification ? (
                      <p className="mt-1 text-xs text-slate-500">Justificativa: {item.totalJustification}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 align-top tabular-nums text-slate-800">
                    {Number(item.quantity).toLocaleString("pt-BR")}
                    {item.billingKind === "ON_DEMAND" ? (
                      <p className="text-xs text-slate-500">
                        Consumido: {Number(item.consumedQuantity ?? 0).toLocaleString("pt-BR")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 align-top text-slate-700">{item.unit?.label ?? "—"}</td>
                  <td className="px-2 py-2 align-top tabular-nums text-slate-800">{formatBrl(item.unitValue)}</td>
                  <td className="px-2 py-2 align-top tabular-nums font-medium text-slate-900">
                    {formatBrl(item.totalValue)}
                  </td>
                  <td className="px-2 py-2 align-top text-slate-700">
                    {BILLING[item.billingKind]}
                    {item.billingKind === "RECURRING" && item.periodicity ? (
                      <p className="text-xs text-slate-500">{PERIOD[item.periodicity]}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totals ? (
        <div className="mt-4 grid gap-3 rounded-md border border-slate-100 bg-slate-50/80 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Recorrente previsto</p>
            <p className="font-medium text-slate-900">{formatBrl(totals.recurringPredicted)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Valores únicos</p>
            <p className="font-medium text-slate-900">{formatBrl(totals.oneTime)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Sob demanda</p>
            <p className="font-medium text-slate-900">{formatBrl(totals.onDemand)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Valor global estimado</p>
            <p className="font-semibold text-slate-900">{formatBrl(totals.globalEstimated)}</p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
