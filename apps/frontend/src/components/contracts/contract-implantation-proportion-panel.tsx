import { Card } from "@/components/ui/card";
import { formatBrl } from "@/lib/format-brl";
import type { FeatureImplantationProportion } from "@/lib/api";

type Props = {
  data?: FeatureImplantationProportion | null;
};

/**
 * Indicador analítico: valor mensal proporcional ao nº de funcionalidades com entrega «Entregue»
 * face ao total de funcionalidades em módulos (ex.: 90/100 → 90% do valor mensal).
 */
export function ContractImplantationProportionPanel({ data }: Props): JSX.Element | null {
  if (!data) {
    return null;
  }

  if (!data.applicable) {
    return (
      <Card className="border-dashed border-sky-200/80 bg-sky-50/40 p-4 dark:border-sky-900/50 dark:bg-sky-950/20">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Implantação e valor mensal proporcional</h2>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{data.explanation ?? "Indicador não aplicável."}</p>
      </Card>
    );
  }

  return (
    <Card className="border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900/60 dark:bg-sky-950/30">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Implantação e valor mensal proporcional</h2>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
        Contam como <strong className="font-medium text-slate-800 dark:text-slate-200">implantadas</strong> apenas as funcionalidades com estado de
        entrega <strong className="font-medium text-slate-800 dark:text-slate-200">Entregue</strong>. Parciais e não entregues entram no total
        (denominador), não no numerador.
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-md border border-sky-100/80 bg-white/70 px-3 py-2 dark:border-sky-900/40 dark:bg-slate-900/40">
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Funcionalidades (módulos)</dt>
          <dd className="mt-0.5 tabular-nums text-slate-900 dark:text-slate-100">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{data.implantedCount}</span> implantadas /{" "}
            <span className="font-semibold">{data.totalFeatures}</span> total
            {data.partialCount > 0 || data.notDeliveredCount > 0 ? (
              <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                ({data.partialCount} {data.partialCount === 1 ? "parcial" : "parciais"},{" "}
                {data.notDeliveredCount} não entregue{data.notDeliveredCount !== 1 ? "s" : ""})
              </span>
            ) : null}
          </dd>
        </div>
        <div className="rounded-md border border-sky-100/80 bg-white/70 px-3 py-2 dark:border-sky-900/40 dark:bg-slate-900/40">
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Proporção implantadas</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-sky-900 dark:text-sky-200">
            {data.ratioImplantedPercent ?? "—"}%
          </dd>
        </div>
        <div className="rounded-md border border-sky-100/80 bg-white/70 px-3 py-2 dark:border-sky-900/40 dark:bg-slate-900/40">
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Valor mensal do contrato</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatBrl(data.contractMonthlyValue)}</dd>
        </div>
        <div className="rounded-md border border-sky-200 bg-white px-3 py-2 dark:border-sky-800 dark:bg-slate-900/60">
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Valor mensal proporcional (indicador)</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-sky-950 dark:text-sky-100">
            {data.proportionalMonthlyValue != null ? formatBrl(data.proportionalMonthlyValue) : "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-500">
        Indicador calculado automaticamente (implantadas ÷ total × valor mensal). Não substitui regras de medição, faturação ou contrato sem
        validação jurídica interna.
      </p>
    </Card>
  );
}
