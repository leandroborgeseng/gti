import { Card } from "@/components/ui/card";
import { getDashboardAlerts, getDashboardSummary } from "@/lib/api";

export default async function DashboardPage(): Promise<JSX.Element> {
  const [summary, alerts] = await Promise.all([getDashboardSummary().catch(() => ({})), getDashboardAlerts().catch(() => ({}))]);
  const governance = (summary.governance ?? {}) as Record<string, number>;
  const goals = (summary.goals ?? {}) as Record<string, number>;
  const kpis = [
    { label: "Total contratado", value: String(summary.totalContratado ?? "0") },
    { label: "Total executado", value: String(summary.totalExecutado ?? "0") },
    { label: "Total glosado", value: String(summary.totalGlosado ?? "0") },
    { label: "Economia gerada", value: String(summary.economiaGerada ?? "0") },
    { label: "Percentual execução", value: `${String(summary.percentualExecucao ?? "0")}%` },
    { label: "% chamados dentro do SLA", value: `${governance.dentroSlaPercentual ?? 0}%` },
    { label: "% chamados fora do SLA", value: `${governance.foraSlaPercentual ?? 0}%` },
    { label: "Chamados escalados", value: String(governance.chamadosEscalados ?? 0) },
    { label: "Na controladoria", value: String(governance.chamadosControladoria ?? 0) },
    { label: "Metas planejadas", value: String(goals.planejadas ?? 0) },
    { label: "Metas em andamento", value: String(goals.emAndamento ?? 0) },
    { label: "Metas concluídas", value: String(goals.concluidas ?? 0) }
  ];
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{kpi.label}</p>
            <p className="mt-2 text-xl font-bold">{kpi.value}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold">Indicadores de governança</h3>
          <ul className="space-y-2 text-sm text-slate-700">
            <li>Dentro do SLA: {governance.dentroSlaPercentual ?? 0}%</li>
            <li>Fora do SLA: {governance.foraSlaPercentual ?? 0}%</li>
            <li>Escalados: {governance.chamadosEscalados ?? 0}</li>
            <li>Controladoria: {governance.chamadosControladoria ?? 0}</li>
          </ul>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Indicadores de metas</h3>
          <ul className="space-y-2 text-sm text-slate-700">
            <li>Planejadas: {goals.planejadas ?? 0}</li>
            <li>Em andamento: {goals.emAndamento ?? 0}</li>
            <li>Concluídas: {goals.concluidas ?? 0}</li>
          </ul>
        </Card>
      </section>

      <Card>
        <h3 className="mb-3 font-semibold">Alertas</h3>
        <pre className="overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(alerts, null, 2)}</pre>
      </Card>
    </div>
  );
}
