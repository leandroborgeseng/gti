import type { Route } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { DataLoadAlert, looksLikeGestaoAuthError } from "@/components/ui/data-load-alert";
import { formatBrl, formatPercent } from "@/lib/format-brl";

type GovernanceBlock = {
  dentroSlaPercentual?: number;
  foraSlaPercentual?: number;
  chamadosEscalados?: number;
  chamadosControladoria?: number;
};

type GoalsBlock = {
  planejadas?: number;
  emAndamento?: number;
  concluidas?: number;
};

type VencendoRow = { id: string; number: string; name: string; endDate: string };
type MedicaoPendenteRow = {
  id: string;
  referenceMonth: number;
  referenceYear: number;
  contract?: { id: string; number?: string; name: string } | null;
};
type BaixaEntregaRow = { id: string; number: string; name: string; percentual: number };
type SlaRow = { id: string; ticketId: string; slaDeadline: string; status: string };

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function parseSummary(raw: Record<string, unknown>): {
  totalContratado: unknown;
  totalExecutado: unknown;
  totalGlosado: unknown;
  economiaGerada: unknown;
  percentualExecucao: unknown;
  governance: GovernanceBlock;
  goals: GoalsBlock;
} {
  const governance = asRecord(raw.governance);
  const goals = asRecord(raw.goals);
  return {
    totalContratado: raw.totalContratado,
    totalExecutado: raw.totalExecutado,
    totalGlosado: raw.totalGlosado,
    economiaGerada: raw.economiaGerada,
    percentualExecucao: raw.percentualExecucao,
    governance: {
      dentroSlaPercentual: Number(governance.dentroSlaPercentual ?? 0),
      foraSlaPercentual: Number(governance.foraSlaPercentual ?? 0),
      chamadosEscalados: Number(governance.chamadosEscalados ?? 0),
      chamadosControladoria: Number(governance.chamadosControladoria ?? 0)
    },
    goals: {
      planejadas: Number(goals.planejadas ?? 0),
      emAndamento: Number(goals.emAndamento ?? 0),
      concluidas: Number(goals.concluidas ?? 0)
    }
  };
}

function parseAlerts(raw: Record<string, unknown>): {
  vencendo: VencendoRow[];
  pendentes: MedicaoPendenteRow[];
  baixaEntrega: BaixaEntregaRow[];
  sla: SlaRow[];
} {
  return {
    vencendo: asArray(raw.contratosVencendo30Dias) as VencendoRow[],
    pendentes: asArray(raw.medicoesPendentes) as MedicaoPendenteRow[],
    baixaEntrega: asArray(raw.contratosBaixaEntrega) as BaixaEntregaRow[],
    sla: asArray(raw.chamadosSlaVencendo) as SlaRow[]
  };
}

export function DashboardHome(props: {
  summary: Record<string, unknown>;
  alerts: Record<string, unknown>;
  /** Falhas ao obter resumo ou alertas (ex.: API indisponível). */
  loadErrors?: string[];
}): JSX.Element {
  const s = parseSummary(props.summary);
  const a = parseAlerts(props.alerts);
  const loadErrors = props.loadErrors ?? [];

  const kpis = [
    { label: "Total contratado", value: formatBrl(s.totalContratado) },
    { label: "Total executado", value: formatBrl(s.totalExecutado) },
    { label: "Total glosado", value: formatBrl(s.totalGlosado) },
    { label: "Economia (contratado − executado)", value: formatBrl(s.economiaGerada) },
    { label: "Percentual de execução", value: formatPercent(s.percentualExecucao) },
    { label: "% chamados dentro do SLA", value: formatPercent(s.governance.dentroSlaPercentual) },
    { label: "% chamados fora do SLA", value: formatPercent(s.governance.foraSlaPercentual) },
    { label: "Chamados escalados", value: String(s.governance.chamadosEscalados ?? 0) },
    { label: "Na controladoria", value: String(s.governance.chamadosControladoria ?? 0) },
    { label: "Metas planejadas", value: String(s.goals.planejadas ?? 0) },
    { label: "Metas em andamento", value: String(s.goals.emAndamento ?? 0) },
    { label: "Metas concluídas", value: String(s.goals.concluidas ?? 0) }
  ];

  return (
    <div className="space-y-8">
      {loadErrors.length > 0 ? (
        <DataLoadAlert
          messages={loadErrors}
          title={looksLikeGestaoAuthError(loadErrors) ? "Sessão ou dados do painel" : "Indicadores incompletos"}
        />
      ) : null}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{kpi.label}</p>
            <p className="mt-2 text-lg font-bold tabular-nums text-slate-900">{kpi.value}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-base font-semibold text-slate-900">Governança de chamados</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>Dentro do SLA: {formatPercent(s.governance.dentroSlaPercentual)}</li>
            <li>Fora do SLA: {formatPercent(s.governance.foraSlaPercentual)}</li>
            <li>Escalados: {s.governance.chamadosEscalados ?? 0}</li>
            <li>Controladoria: {s.governance.chamadosControladoria ?? 0}</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Os percentuais consideram os registos de governança em cache. Para operação GLPI em tempo real, use{" "}
            <Link href={"/chamados" as Route} className="font-medium text-slate-800 underline">
              Chamados
            </Link>
            .
          </p>
        </Card>
        <Card>
          <h3 className="text-base font-semibold text-slate-900">Metas</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>Planejadas: {s.goals.planejadas ?? 0}</li>
            <li>Em andamento: {s.goals.emAndamento ?? 0}</li>
            <li>Concluídas: {s.goals.concluidas ?? 0}</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            <Link href={"/goals" as Route} className="font-medium text-slate-800 underline">
              Abrir metas
            </Link>
          </p>
        </Card>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-slate-900">Alertas operacionais</h3>
        <p className="mb-4 max-w-3xl text-sm text-slate-600">
          Resumo do que precisa de atenção (contratos a vencer, medições em aberto, entregas abaixo do mínimo e SLAs a expirar), alinhado ao painel executivo do sistema anterior.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h4 className="text-sm font-semibold text-slate-900">Contratos a vencer (30 dias)</h4>
            <p className="mt-1 text-xs text-slate-500">Vigência a terminar no prazo indicado.</p>
            {a.vencendo.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nenhum contrato nesta janela.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {a.vencendo.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium text-slate-800">
                      {c.number} — {c.name}
                    </span>
                    <span className="text-xs text-slate-600">{new Date(c.endDate).toLocaleDateString("pt-BR")}</span>
                    <Link href={`/contracts/${c.id}` as Route} className="text-xs font-semibold text-slate-900 underline">
                      Abrir
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h4 className="text-sm font-semibold text-slate-900">Medições pendentes</h4>
            <p className="mt-1 text-xs text-slate-500">Abertas ou em revisão.</p>
            {a.pendentes.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nenhuma medição pendente.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {a.pendentes.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-slate-800">
                      {m.contract?.name ?? "Contrato"} — {String(m.referenceMonth).padStart(2, "0")}/{m.referenceYear}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      {m.contract?.id ? (
                        <Link
                          href={`/measurements?contractId=${m.contract.id}` as Route}
                          className="text-xs font-semibold text-slate-600 underline"
                        >
                          Medições do contrato
                        </Link>
                      ) : null}
                      <Link href={`/measurements/${m.id}` as Route} className="text-xs font-semibold text-slate-900 underline">
                        Abrir
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h4 className="text-sm font-semibold text-amber-900">Contratos com baixa entrega (&lt; 40% validado)</h4>
            <p className="mt-1 text-xs text-slate-500">Contratos tipo Software ou Serviço: funcionalidades validadas sobre o total.</p>
            {a.baixaEntrega.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nenhum contrato abaixo do limiar.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {a.baixaEntrega.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium text-slate-800">
                      {c.number} — {c.name}{" "}
                      <span className="tabular-nums text-amber-800">({formatPercent(c.percentual, 1)} validado)</span>
                    </span>
                    <Link href={`/contracts/${c.id}` as Route} className="text-xs font-semibold text-slate-900 underline">
                      Estrutura
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h4 className="text-sm font-semibold text-slate-900">SLA de governança a vencer (30 dias)</h4>
            <p className="mt-1 text-xs text-slate-500">Chamados em acompanhamento sem resolução.</p>
            {a.sla.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nenhum prazo nesta janela.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {a.sla.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-slate-800">
                      Ticket <span className="font-mono text-xs">{g.ticketId}</span> — {g.status}
                    </span>
                    <span className="text-xs text-slate-600">{new Date(g.slaDeadline).toLocaleString("pt-BR")}</span>
                    <Link href={"/governance" as Route} className="text-xs font-semibold text-slate-900 underline">
                      Governança
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
