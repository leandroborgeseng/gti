import type { Route } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { formatBrl } from "@/lib/format-brl";
import { getMonthlyContractClosureReport } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const measurementStatusPt: Record<string, string> = {
  OPEN: "Aberta",
  UNDER_REVIEW: "Em revisão",
  APPROVED: "Aprovada",
  GLOSSED: "Glosada"
};

function parseYm(searchParams: Record<string, string | string[] | undefined> | undefined): { year: number; month: number } {
  const now = new Date();
  const yRaw = searchParams?.year;
  const mRaw = searchParams?.month;
  const y = Number(typeof yRaw === "string" ? yRaw : Array.isArray(yRaw) ? yRaw[0] : "");
  const m = Number(typeof mRaw === "string" ? mRaw : Array.isArray(mRaw) ? mRaw[0] : "");
  const year = Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : now.getFullYear();
  const month = Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1;
  return { year, month };
}

export default async function FechamentoMensalPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const { year, month } = parseYm(searchParams);
  const res = await safeLoad(() => getMonthlyContractClosureReport(year, month), []);
  const rows = res.data ?? [];
  const errors = collectLoadErrors([res.error]);

  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro"
  ];
  const titleMonth = monthNames[month - 1] ?? String(month);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <Link href={"/reports" as Route} className="font-medium text-foreground underline-offset-4 hover:underline">
            ← Relatórios
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fechamento mensal por contrato</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Contratos <strong className="font-medium text-foreground">ativos</strong> com vigência sobre o mês seleccionado: valor total no
          cadastro, <strong className="font-medium text-foreground">pagamento reconhecido</strong> na medição aprovada do mês (e do mês anterior
          como referência), estado da medição do mês, e chamados GLPI vinculados aos grupos do contrato (abertos no mês, fechados no mês, e
          represados ainda abertos desde meses anteriores).
        </p>
      </header>

      <Card className="p-4 sm:p-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="fm-month" className="text-xs font-medium text-muted-foreground">
              Mês
            </label>
            <select
              id="fm-month"
              name="month"
              defaultValue={month}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              {monthNames.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="fm-year" className="text-xs font-medium text-muted-foreground">
              Ano
            </label>
            <input
              id="fm-year"
              name="year"
              type="number"
              min={2000}
              max={2100}
              defaultValue={year}
              className="h-10 w-28 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            />
          </div>
          <button
            type="submit"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:opacity-90"
          >
            Atualizar
          </button>
        </form>
      </Card>

      {errors.length > 0 ? <DataLoadAlert messages={errors} title="Não foi possível carregar o relatório" /> : null}

      <Card className="overflow-hidden p-0">
        <div className="border-b bg-muted/40 px-4 py-3 text-sm font-medium text-foreground">
          Competência: {titleMonth} de {year} · {rows.length} contrato(s)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Contrato</th>
                <th className="px-3 py-2">Valor total (cadastro)</th>
                <th className="px-3 py-2">Mensalidade</th>
                <th className="px-3 py-2">Implantação</th>
                <th className="px-3 py-2">Período impl.</th>
                <th className="px-3 py-2">Medição (estado)</th>
                <th className="px-3 py-2 text-right">Pago mês ant. (aprov.)</th>
                <th className="px-3 py-2 text-right">Pago mês (aprov.)</th>
                <th className="px-3 py-2 text-right">Medido mês</th>
                <th className="px-3 py-2 text-right">OS abertas</th>
                <th className="px-3 py-2 text-right">OS fechadas</th>
                <th className="px-3 py-2 text-right">OS represadas</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum contrato activo com vigência neste mês.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.contractId} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Link
                        href={`/contracts/${r.contractId}` as Route}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {r.contractNumber}
                      </Link>
                      <div className="max-w-[220px] truncate text-xs text-muted-foreground">{r.contractName}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatBrl(r.contractTotalValue)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatBrl(r.contractMonthlyValue)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatBrl(r.contractInstallationValue)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.implementationPeriodStart ?? "—"} → {r.implementationPeriodEnd ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.measurementStatus ? measurementStatusPt[r.measurementStatus] ?? r.measurementStatus : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBrl(r.previousMonthApprovedPayment)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBrl(r.monthApprovedPayment)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBrl(r.monthMeasuredValue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.glpiOsOpenedInMonth}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.glpiOsClosedInMonth}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-800 dark:text-amber-200">{r.glpiOsOpenBacklog}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        OS GLPI: contagens baseiam-se nos chamados sincronizados cujo grupo coincide com os grupos associados ao contrato. Estados
        «fechados» são detectados por palavras-chave típicas (ex.: fechado, solucionado). Represadas = ainda abertas e criadas antes do primeiro
        dia do mês seleccionado.
      </p>
    </div>
  );
}
