import { Card } from "@/components/ui/card";
import { formatBrl } from "@/lib/format-brl";
import type { BillingPhase, FeatureImplantationProportion } from "@/lib/api";

type Props = {
  data?: FeatureImplantationProportion | null;
};

const phaseDescription: Record<BillingPhase, string> = {
  UNDEFINED:
    "Defina início e fim do período de implantação no cadastro do contrato para o sistema assinalar automaticamente a fase (pré, implantação ou mensalidade).",
  PRE_IMPLEMENTATION: "Ainda antes do período de implantação: a rubrica de referência tende a ser a implantação quando esta começar.",
  IMPLEMENTATION:
    "Dentro do período de implantação: a referência proporcional principal é o valor de implantação (pago de forma proporcional ao progresso de entrega dos itens).",
  MONTHLY:
    "Após o fim do período de implantação: a referência proporcional principal passa a ser a mensalidade (também proporcional ao progresso de entrega dos itens)."
};

/**
 * Indicador analítico: mesma proporção de itens entregues aplicada ao valor de implantação e à mensalidade;
 * fase (pré / implantação / mensalidade) conforme as datas do período de implantação no contrato.
 */
export function ContractImplantationProportionPanel({ data }: Props): JSX.Element | null {
  if (!data) {
    return null;
  }

  const phase = data.billingPhase ?? "UNDEFINED";
  const emphasis = data.billingEmphasis ?? "BOTH";

  if (!data.applicable) {
    return (
      <Card className="border-dashed border-sky-200/80 bg-sky-50/40 p-4 dark:border-sky-900/50 dark:bg-sky-950/20">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Implantação, fase e valores proporcionais</h2>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{data.explanation ?? "Indicador não aplicável."}</p>
      </Card>
    );
  }

  return (
    <Card className="border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900/60 dark:bg-sky-950/30">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Implantação, fase e valores proporcionais</h2>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
        Cada funcionalidade conta no <strong className="font-medium text-slate-800 dark:text-slate-200">numerador</strong> com peso{" "}
        <strong className="font-medium text-slate-800 dark:text-slate-200">1</strong> (Entregue),{" "}
        <strong className="font-medium text-slate-800 dark:text-slate-200">0,5</strong> (Parcialmente entregue) ou{" "}
        <strong className="font-medium text-slate-800 dark:text-slate-200">0</strong> (Não entregue). O mesmo factor multiplica o valor de
        implantação e a mensalidade.
      </p>

      <div
        className={`mt-3 rounded-md border px-3 py-2 text-xs ${
          emphasis === "INSTALLATION"
            ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            : emphasis === "MONTHLY"
              ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
              : "border-slate-200 bg-white/80 text-slate-800 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
        }`}
      >
        <p className="font-medium text-slate-900 dark:text-slate-100">
          Fase:{" "}
          {phase === "UNDEFINED"
            ? "Período não definido ou incompleto"
            : phase === "PRE_IMPLEMENTATION"
              ? "Pré-implantação"
              : phase === "IMPLEMENTATION"
                ? "Período de implantação"
                : "Mensalidade (pós-implantação)"}
        </p>
        <p className="mt-1 leading-relaxed text-slate-700 dark:text-slate-300">{phaseDescription[phase]}</p>
        {data.implementationPeriodStart || data.implementationPeriodEnd ? (
          <p className="mt-2 tabular-nums text-slate-600 dark:text-slate-400">
            Período registado: {data.implementationPeriodStart ?? "—"} → {data.implementationPeriodEnd ?? "—"}
          </p>
        ) : null}
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-md border border-sky-100/80 bg-white/70 px-3 py-2 dark:border-sky-900/40 dark:bg-slate-900/40">
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Funcionalidades (módulos)</dt>
          <dd className="mt-0.5 tabular-nums text-slate-900 dark:text-slate-100">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{data.implantedCount}</span> entregues /{" "}
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
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Proporção (peso de entrega)</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-sky-900 dark:text-sky-200">
            {data.ratioImplantedPercent ?? "—"}%
          </dd>
        </div>
        <div
          className={`rounded-md border px-3 py-2 dark:bg-slate-900/40 ${
            emphasis === "INSTALLATION"
              ? "border-amber-200 bg-amber-50/90 dark:border-amber-900/50"
              : "border-sky-100/80 bg-white/70 dark:border-sky-900/40"
          }`}
        >
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Implantação (contrato)</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatBrl(data.contractInstallationValue)}
          </dd>
          <dt className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">Implantação proporcional (indicador)</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-amber-950 dark:text-amber-100">
            {data.proportionalInstallationValue != null ? formatBrl(data.proportionalInstallationValue) : "—"}
          </dd>
        </div>
        <div
          className={`rounded-md border px-3 py-2 dark:bg-slate-900/40 ${
            emphasis === "MONTHLY"
              ? "border-emerald-200 bg-emerald-50/90 dark:border-emerald-900/50"
              : "border-sky-100/80 bg-white/70 dark:border-sky-900/40"
          }`}
        >
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Mensalidade (contrato)</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatBrl(data.contractMonthlyValue)}</dd>
          <dt className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">Mensalidade proporcional (indicador)</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-sky-950 dark:text-sky-100">
            {data.proportionalMonthlyValue != null ? formatBrl(data.proportionalMonthlyValue) : "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-500">
        Indicador calculado automaticamente (mesma proporção × valor de implantação ou × mensalidade). Não substitui regras de medição,
        faturação ou contrato sem validação jurídica interna.
      </p>
    </Card>
  );
}
