import type { Route } from "next";
import Link from "next/link";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { getDashboardAlerts, getDashboardSummary } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage(): Promise<JSX.Element> {
  const empty: Record<string, unknown> = {};
  const [sumRes, alRes] = await Promise.all([
    safeLoad(() => getDashboardSummary(), empty),
    safeLoad(() => getDashboardAlerts(), empty)
  ]);
  const loadErrors = collectLoadErrors([sumRes.error, alRes.error]);

  return (
    <div className="gti-exec-metric-dash space-y-5">
      <section className="aging-dash" aria-labelledby="exec-dash-title">
        <div className="aging-dash__intro">
          <h1 id="exec-dash-title" className="aging-dash__title">
            Painel executivo
          </h1>
          <p className="aging-dash__lede m-0 max-w-3xl">
            Indicadores financeiros, governança de chamados e alertas operacionais (paridade com o painel de contratos
            do sistema anterior, em formato enxuto).
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            <Link
              href={"/manual" as Route}
              className="font-medium text-foreground underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground"
            >
              Manual do sistema
            </Link>
            <span className="text-muted-foreground"> — descrição das áreas e fluxos para utilizadores.</span>
          </p>
        </div>
      </section>
      <DashboardHome summary={sumRes.data} alerts={alRes.data} loadErrors={loadErrors} />
    </div>
  );
}
