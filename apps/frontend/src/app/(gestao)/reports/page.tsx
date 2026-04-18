import type { Route } from "next";
import Link from "next/link";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { Card } from "@/components/ui/card";
import { getDashboardAlerts, getDashboardSummary } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReportsPage(): Promise<JSX.Element> {
  const empty: Record<string, unknown> = {};
  const [summaryRaw, alertsRaw] = await Promise.all([
    getDashboardSummary().catch(() => empty),
    getDashboardAlerts().catch(() => empty)
  ]);
  const summary = summaryRaw as Record<string, unknown>;
  const alerts = alertsRaw as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Relatórios e exportações</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Os mesmos indicadores e alertas do painel executivo, com acesso rápido a ficheiros CSV para arquivo ou auditoria
          externa.
        </p>
      </header>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Dados tabulares (CSV)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Contratos, medições e glosas em UTF-8 com BOM. Requer perfil de <strong className="font-medium text-slate-800">edição</strong>{" "}
          ou <strong className="font-medium text-slate-800">administrador</strong>.
        </p>
        <Link
          href={"/exports" as Route}
          className="mt-4 inline-flex text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
        >
          Abrir exportações →
        </Link>
      </Card>

      <DashboardHome summary={summary} alerts={alerts} />
    </div>
  );
}
