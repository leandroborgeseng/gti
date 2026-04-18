import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { getDashboardAlerts, getDashboardSummary } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage(): Promise<JSX.Element> {
  const empty: Record<string, unknown> = {};
  const [summaryRaw, alertsRaw] = await Promise.all([
    getDashboardSummary().catch(() => empty),
    getDashboardAlerts().catch(() => empty)
  ]);
  const summary = summaryRaw as Record<string, unknown>;
  const alerts = alertsRaw as Record<string, unknown>;

  return (
    <div className="space-y-2">
      <header className="space-y-1 pb-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Painel executivo</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Indicadores financeiros, governança de chamados e alertas operacionais (paridade com o painel de contratos do
          sistema anterior, em formato enxuto).
        </p>
      </header>
      <DashboardHome summary={summary} alerts={alerts} />
    </div>
  );
}
