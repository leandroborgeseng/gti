import { Card } from "@/components/ui/card";
import { getDashboardAlerts, getDashboardSummary } from "@/lib/api";

export default async function ReportsPage(): Promise<JSX.Element> {
  const [summary, alerts] = await Promise.all([getDashboardSummary().catch(() => ({})), getDashboardAlerts().catch(() => ({}))]);
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-semibold">Relatórios</h3>
        <p className="text-sm text-slate-600">Consolidação de indicadores financeiros, SLA e metas.</p>
      </Card>
      <Card>
        <h4 className="mb-2 font-medium">Resumo executivo</h4>
        <pre className="overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(summary, null, 2)}</pre>
      </Card>
      <Card>
        <h4 className="mb-2 font-medium">Alertas operacionais</h4>
        <pre className="overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(alerts, null, 2)}</pre>
      </Card>
    </div>
  );
}
