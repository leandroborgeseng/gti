import type { Route } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { formatBrl } from "@/lib/format-brl";
import { getOrganizations, getPricingItemsFinancialReport } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function firstParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

export default async function ItensContratuaisReportPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const organizationId = firstParam(searchParams?.organizationId);
  const statusRaw = firstParam(searchParams?.status);
  const status = statusRaw === "ACTIVE" || statusRaw === "CANCELLED" ? statusRaw : undefined;
  const yearRaw = Number(firstParam(searchParams?.year));
  const monthRaw = Number(firstParam(searchParams?.month));
  const year = Number.isFinite(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : undefined;
  const month = Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : undefined;
  const [report, organizations] = await Promise.all([
    safeLoad(() => getPricingItemsFinancialReport({ organizationId, status, year, month }), []),
    safeLoad(() => getOrganizations(), [])
  ]);
  const rows = report.data ?? [];
  const errors = collectLoadErrors([report.error, organizations.error]);
  const now = new Date();
  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <Link href={"/reports" as Route} className="font-medium text-foreground underline-offset-4 hover:underline">
            ← Relatórios
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Relatório financeiro por item contratual</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Consulte valores contratados, consumo, saldo e o total já medido de cada item dos contratos não excluídos.
        </p>
      </header>

      <Card className="p-4 sm:p-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Órgão
            <select
              name="organizationId"
              defaultValue={organizationId ?? ""}
              className="block h-10 min-w-56 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm"
            >
              <option value="">Todos</option>
              {(organizations.data ?? []).map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Situação do item
            <select
              name="status"
              defaultValue={status ?? ""}
              className="block h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm"
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Ativo</option>
              <option value="CANCELLED">Cancelado</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Competência (medido)
            <div className="flex gap-2">
              <select
                name="month"
                defaultValue={month ?? ""}
                className="block h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm"
              >
                <option value="">Mês (todos)</option>
                {[
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
                ].map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                name="year"
                defaultValue={year ?? ""}
                className="block h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm"
              >
                <option value="">Ano (todos)</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <button
            type="submit"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:opacity-90"
          >
            Filtrar
          </button>
          <a
            href="/api/exports/pricing-items.csv"
            className="h-10 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted"
          >
            Baixar CSV
          </a>
        </form>
      </Card>

      {errors.length > 0 ? <DataLoadAlert messages={errors} title="Não foi possível carregar o relatório" /> : null}

      <Card className="overflow-hidden p-0">
        <div className="border-b bg-muted/40 px-4 py-3 text-sm font-medium text-foreground">{rows.length} item(ns) encontrado(s)</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1450px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Contrato</th>
                <th className="px-3 py-2">Órgão / fornecedor</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Cobrança</th>
                <th className="px-3 py-2 text-right">Qtd.</th>
                <th className="px-3 py-2 text-right">Consumido</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-right">Unitário</th>
                <th className="px-3 py-2 text-right">Contratado</th>
                <th className="px-3 py-2 text-right">Medido</th>
                <th className="px-3 py-2">Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum item contratual encontrado.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.itemId} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Link href={`/contracts/${row.contractId}` as Route} className="font-medium underline-offset-2 hover:underline">
                        {row.contractNumber}
                      </Link>
                      <div className="max-w-52 truncate text-xs text-muted-foreground">{row.contractName}</div>
                      {row.internalCode ? <div className="text-xs text-muted-foreground">{row.internalCode}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{row.organizationName ?? "-"}</div>
                      <div className="text-muted-foreground">{row.supplierName}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.sequence}. {row.typeLabel}</div>
                      <div className="max-w-72 truncate text-xs text-muted-foreground">{row.description}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{row.billingKind}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(row.quantity).toLocaleString("pt-BR")} {row.unitLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(row.consumedQuantity).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(row.availableBalance).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBrl(row.unitValue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBrl(row.totalValue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBrl(row.measuredValueSum)}</td>
                    <td className="px-3 py-2 text-xs">{row.status === "ACTIVE" ? "Ativo" : "Cancelado"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
