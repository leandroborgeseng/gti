import type { Route } from "next";
import Link from "next/link";
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

type ExecKpiTone =
  | "week"
  | "d15"
  | "d30"
  | "d60"
  | "over"
  | "prj-projects"
  | "prj-tasks"
  | "prj-overdue"
  | "prj-nodue";

const KPI_CARD_TONES: ExecKpiTone[] = [
  "prj-projects",
  "prj-tasks",
  "d30",
  "week",
  "d15",
  "week",
  "over",
  "d60",
  "prj-nodue",
  "prj-projects",
  "prj-tasks",
  "week"
];

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

function ExecKpiCard({ label, value, tone }: { label: string; value: string; tone: ExecKpiTone }): JSX.Element {
  return (
    <div className={`aging-card aging-card--${tone} aging-card--kpi-only`} role="listitem">
      <div className="aging-card__value-row">
        <span className="aging-card__value">{value}</span>
      </div>
      <h3 className="aging-card__title">{label}</h3>
    </div>
  );
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

  const kpis: { label: string; value: string }[] = [
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
    <div className="space-y-5">
      {loadErrors.length > 0 ? (
        <DataLoadAlert
          messages={loadErrors}
          title={looksLikeGestaoAuthError(loadErrors) ? "Sessão ou dados do painel" : "Indicadores incompletos"}
        />
      ) : null}

      <section className="aging-dash" aria-labelledby="exec-kpis-title">
        <div className="aging-dash__intro">
          <h2 id="exec-kpis-title" className="aging-dash__title">
            Indicadores consolidados
          </h2>
        </div>
        <div className="aging-dash__grid" role="list">
          {kpis.map((kpi, i) => (
            <ExecKpiCard key={kpi.label} label={kpi.label} value={kpi.value} tone={KPI_CARD_TONES[i] ?? "prj-nodue"} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="aging-dash" aria-labelledby="exec-gov-title">
          <div className="aging-dash__intro">
            <h2 id="exec-gov-title" className="aging-dash__title">
              Governança de chamados
            </h2>
          </div>
          <ul className="aging-dash__panel-list m-0">
            <li>Dentro do SLA: {formatPercent(s.governance.dentroSlaPercentual)}</li>
            <li>Fora do SLA: {formatPercent(s.governance.foraSlaPercentual)}</li>
            <li>Escalados: {s.governance.chamadosEscalados ?? 0}</li>
            <li>Controladoria: {s.governance.chamadosControladoria ?? 0}</li>
          </ul>
          <p className="aging-dash__lede m-0 mt-3">
            Os percentuais consideram os registos de governança em cache. Para operação GLPI em tempo real, use{" "}
            <Link href={"/chamados" as Route}>Chamados</Link>.
          </p>
        </section>

        <section className="aging-dash" aria-labelledby="exec-goals-title">
          <div className="aging-dash__intro">
            <h2 id="exec-goals-title" className="aging-dash__title">
              Metas
            </h2>
          </div>
          <ul className="aging-dash__panel-list m-0">
            <li>Planejadas: {s.goals.planejadas ?? 0}</li>
            <li>Em andamento: {s.goals.emAndamento ?? 0}</li>
            <li>Concluídas: {s.goals.concluidas ?? 0}</li>
          </ul>
          <p className="aging-dash__lede m-0 mt-3">
            <Link href={"/goals" as Route}>Abrir metas</Link>
          </p>
        </section>
      </div>

      <section className="aging-dash" aria-labelledby="exec-alerts-title">
        <div className="aging-dash__intro">
          <h2 id="exec-alerts-title" className="aging-dash__title">
            Alertas operacionais
          </h2>
          <p className="aging-dash__lede m-0 max-w-3xl">
            Resumo do que precisa de atenção (contratos a vencer, medições em aberto, entregas abaixo do mínimo e SLAs
            a expirar), alinhado ao painel executivo do sistema anterior.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="aging-dash__panel">
            <h3 className="aging-dash__panel-title">Contratos a vencer (30 dias)</h3>
            <p className="aging-dash__panel-lede">Vigência a terminar no prazo indicado.</p>
            {a.vencendo.length === 0 ? (
              <p className="m-0 text-sm text-[var(--ink-muted)]">Nenhum contrato nesta janela.</p>
            ) : (
              <ul className="aging-dash__panel-list">
                {a.vencendo.map((c) => (
                  <li key={c.id}>
                    <span className="font-semibold text-[var(--ink)]">
                      {c.number} — {c.name}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
                      <span>{new Date(c.endDate).toLocaleDateString("pt-BR")}</span>
                      <Link href={`/contracts/${c.id}` as Route} className="font-semibold text-[var(--brand)] no-underline hover:underline">
                        Abrir
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="aging-dash__panel">
            <h3 className="aging-dash__panel-title">Medições pendentes</h3>
            <p className="aging-dash__panel-lede">Abertas ou em revisão.</p>
            {a.pendentes.length === 0 ? (
              <p className="m-0 text-sm text-[var(--ink-muted)]">Nenhuma medição pendente.</p>
            ) : (
              <ul className="aging-dash__panel-list">
                {a.pendentes.map((m) => (
                  <li key={m.id}>
                    <span className="text-[var(--ink)]">
                      {m.contract?.name ?? "Contrato"} — {String(m.referenceMonth).padStart(2, "0")}/{m.referenceYear}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      {m.contract?.id ? (
                        <Link
                          href={`/measurements?contractId=${m.contract.id}` as Route}
                          className="text-xs font-semibold text-[var(--brand)] no-underline hover:underline"
                        >
                          Medições do contrato
                        </Link>
                      ) : null}
                      <Link href={`/measurements/${m.id}` as Route} className="text-xs font-semibold text-[var(--brand)] no-underline hover:underline">
                        Abrir
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="aging-dash__panel">
            <h3 className="aging-dash__panel-title text-amber-900">Contratos com baixa entrega (&lt; 40% validado)</h3>
            <p className="aging-dash__panel-lede">Contratos tipo Software ou Serviço: funcionalidades validadas sobre o total.</p>
            {a.baixaEntrega.length === 0 ? (
              <p className="m-0 text-sm text-[var(--ink-muted)]">Nenhum contrato abaixo do limiar.</p>
            ) : (
              <ul className="aging-dash__panel-list">
                {a.baixaEntrega.map((c) => (
                  <li key={c.id}>
                    <span className="font-semibold text-[var(--ink)]">
                      {c.number} — {c.name}{" "}
                      <span className="tabular-nums text-amber-800">({formatPercent(c.percentual, 1)} validado)</span>
                    </span>
                    <Link href={`/contracts/${c.id}` as Route} className="text-xs font-semibold text-[var(--brand)] no-underline hover:underline">
                      Estrutura
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="aging-dash__panel">
            <h3 className="aging-dash__panel-title">SLA de governança a vencer (30 dias)</h3>
            <p className="aging-dash__panel-lede">Chamados em acompanhamento sem resolução.</p>
            {a.sla.length === 0 ? (
              <p className="m-0 text-sm text-[var(--ink-muted)]">Nenhum prazo nesta janela.</p>
            ) : (
              <ul className="aging-dash__panel-list">
                {a.sla.map((g) => (
                  <li key={g.id}>
                    <span className="text-[var(--ink)]">
                      Ticket <span className="font-mono text-xs">{g.ticketId}</span> — {g.status}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
                      <span>{new Date(g.slaDeadline).toLocaleString("pt-BR")}</span>
                      <Link href={"/governance" as Route} className="font-semibold text-[var(--brand)] no-underline hover:underline">
                        Governança
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
