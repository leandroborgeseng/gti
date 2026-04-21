"use client";

import type { Route } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type {
  ChamadosClosingsByMonth,
  ChamadosOpeningsByMonth,
  ChamadosOperationsSummary,
  ChamadosRankRow
} from "@/glpi/kanban-load";
import { cn } from "@/lib/utils";

const OPS_EXPANDED_LS_KEY = "gti.chamados.opsExpanded";

type TimelineRow = {
  month: string;
  label: string;
  aberturas: number;
  fechamentos: number;
  fechamentosAcum: number;
};

function mergeAberturasFechamentosTimeline(
  openings: ChamadosOpeningsByMonth[],
  closings: ChamadosClosingsByMonth[]
): TimelineRow[] {
  const map = new Map<string, { aberturas: number; fechamentos: number; label: string }>();
  for (const o of openings) {
    const prev = map.get(o.month);
    map.set(o.month, {
      aberturas: o.count,
      fechamentos: prev?.fechamentos ?? 0,
      label: o.label
    });
  }
  for (const c of closings) {
    const prev = map.get(c.month);
    map.set(c.month, {
      aberturas: prev?.aberturas ?? 0,
      fechamentos: c.count,
      label: prev?.label || c.label
    });
  }
  const months = Array.from(map.keys()).sort();
  let cum = 0;
  return months.map((month) => {
    const cell = map.get(month)!;
    cum += cell.fechamentos;
    return {
      month,
      label: cell.label,
      aberturas: cell.aberturas,
      fechamentos: cell.fechamentos,
      fechamentosAcum: cum
    };
  });
}

function MiniTable({ title, rows }: { title: string; rows: ChamadosRankRow[] }): JSX.Element {
  return (
    <div className="chamados-ops__block">
      <h3 className="chamados-ops__block-title">{title}</h3>
      <div className="chamados-ops__table-wrap">
        <table className="chamados-ops__table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="chamados-ops__th-num">
                Qtd
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${title}-${r.label}`}>
                <td>{r.label}</td>
                <td className="chamados-ops__td-num">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AberturasFechamentosChart({
  openings,
  closings,
  ticketSyncScope
}: {
  openings: ChamadosOpeningsByMonth[];
  closings: ChamadosClosingsByMonth[];
  ticketSyncScope: "open" | "all";
}): JSX.Element {
  const data = useMemo(
    () => mergeAberturasFechamentosTimeline(openings, closings),
    [openings, closings]
  );

  if (data.length === 0) {
    return (
      <div className="chamados-ops__chart-wrap">
        <h3 className="chamados-ops__block-title">Abertos e fechados ao longo do tempo</h3>
        <p className="chamados-ops__chart-empty">
          Não há datas válidas no cache para estes filtros (aberturas de stock aberto e/ou fechamentos).
        </p>
      </div>
    );
  }

  return (
    <div className="chamados-ops__chart-wrap">
      <h3 className="chamados-ops__block-title">Abertos e fechados ao longo do tempo</h3>
      {ticketSyncScope === "open" ? (
        <p className="chamados-ops__scope-hint">
          O cache está em modo <strong>só abertos</strong>: não há tickets fechados guardados — as barras verdes e o
          acumulado não refletem fechamentos reais. O predefinido da aplicação é <strong>todos os tickets</strong>; no
          quadro, em Cache, escolha «Todos os tickets» e clique em <strong>Guardar escopo</strong>, depois deixe o sync
          correr.
        </p>
      ) : null}
      <p className="chamados-ops__chart-hint">
        <strong>Barras azuis</strong>: chamados <strong>ainda abertos</strong> por mês de abertura (América/São Paulo).
        <strong> Barras verdes</strong>: chamados <strong>fechados</strong> no mês (última alteração GLPI, ou abertura se
        faltar). <strong>Linha</strong>: acumulado de fechados no período exibido.
      </p>
      <div
        className="chamados-ops__chart-surface"
        role="img"
        aria-label="Gráfico combinado de aberturas e fechamentos por mês"
      >
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 8, right: 18, left: 0, bottom: 8 }} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#64748b" }}
              interval="preserveStartEnd"
              tickMargin={8}
            />
            <YAxis
              yAxisId="left"
              allowDecimals={false}
              width={42}
              tick={{ fontSize: 11, fill: "#64748b" }}
              label={{ value: "No mês", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              allowDecimals={false}
              width={46}
              tick={{ fontSize: 11, fill: "#0f766e" }}
              label={{ value: "Acum. fech.", angle: 90, position: "insideRight", fill: "#94a3b8", fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: "rgba(100, 116, 139, 0.06)" }}
              formatter={(value, name) => {
                const n = typeof value === "number" ? value : Number(value);
                const safe = Number.isFinite(n) ? n : 0;
                const label =
                  name === "aberturas"
                    ? "Abertos (abertura no mês)"
                    : name === "fechamentos"
                      ? "Fechados (no mês)"
                      : name === "fechamentosAcum"
                        ? "Acumulado fechados"
                        : String(name);
                return [`${safe}`, label];
              }}
              labelFormatter={(label, items) => {
                const row = items?.[0]?.payload as { month?: string } | undefined;
                return row?.month ? `Mês ${row.month}` : String(label ?? "");
              }}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                fontSize: 13
              }}
            />
            <Legend wrapperStyle={{ fontSize: "12px", paddingTop: 6 }} />
            <Bar
              yAxisId="left"
              dataKey="aberturas"
              name="Abertos (no mês)"
              fill="#2563eb"
              radius={[4, 4, 0, 0]}
              maxBarSize={44}
            />
            <Bar
              yAxisId="left"
              dataKey="fechamentos"
              name="Fechados (no mês)"
              fill="#059669"
              radius={[4, 4, 0, 0]}
              maxBarSize={44}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="fechamentosAcum"
              name="Acum. fechados (período)"
              stroke="#0f766e"
              strokeWidth={2.2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ChamadosOperationsPanel({
  summary,
  ticketSyncScope
}: {
  summary: ChamadosOperationsSummary;
  ticketSyncScope: "open" | "all";
}): JSX.Element {
  const panelBodyId = useId();
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(OPS_EXPANDED_LS_KEY);
      if (v === "false") {
        setExpanded(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(OPS_EXPANDED_LS_KEY, next ? "true" : "false");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const conc =
    summary.concentrationTop3GroupsPct != null
      ? `${summary.concentrationTop3GroupsPct}%`
      : "—";

  return (
    <section className="chamados-ops" aria-labelledby="chamados-ops-title">
      <button
        type="button"
        className="chamados-ops__header"
        aria-expanded={expanded}
        aria-controls={panelBodyId}
        aria-label={
          expanded ? "Recolher painel de indicadores de operação" : "Expandir painel de indicadores de operação"
        }
        onClick={toggle}
      >
        <span className="chamados-ops__header-main">
          <ChevronDown
            className={cn("chamados-ops__chevron", !expanded && "chamados-ops__chevron--collapsed")}
            aria-hidden
            strokeWidth={2.25}
            size={22}
          />
          <span id="chamados-ops-title" className="chamados-ops__header-title">
            Indicadores de operação
          </span>
        </span>
        <span className="chamados-ops__header-meta">{summary.openTotal} abertos</span>
      </button>

      {expanded ? (
        <div className="chamados-ops__body" id={panelBodyId}>
          <div className="chamados-ops__intro">
            <p className="chamados-ops__lede">
              Mesmos filtros do Kanban e do painel de idade: apenas chamados <strong>não fechados</strong> no cache.
              Útil para priorizar stock antigo, grupos (GLPI/contrato) e solicitantes.
            </p>
          </div>

          <AberturasFechamentosChart
            openings={summary.openingsByMonth}
            closings={summary.closingsByMonth}
            ticketSyncScope={ticketSyncScope}
          />

          {summary.openTotal === 0 ? (
            <p className="chamados-ops__empty">Nenhum chamado aberto para estes filtros.</p>
          ) : (
            <>
              <div className="chamados-ops__kpis" role="list">
                <div className="chamados-ops__kpi" role="listitem">
                  <span className="chamados-ops__kpi-v">{summary.openTotal}</span>
                  <span className="chamados-ops__kpi-l">Abertos (filtro)</span>
                </div>
                <div className="chamados-ops__kpi" role="listitem">
                  <span className="chamados-ops__kpi-v">{summary.agePctOver30}%</span>
                  <span className="chamados-ops__kpi-l">Com mais de 30 dias</span>
                </div>
                <div className="chamados-ops__kpi" role="listitem">
                  <span className="chamados-ops__kpi-v">{summary.agePctOver60}%</span>
                  <span className="chamados-ops__kpi-l">Com mais de 60 dias</span>
                </div>
                <div className="chamados-ops__kpi" role="listitem">
                  <span className="chamados-ops__kpi-v">{summary.weightedDaysCapped90}</span>
                  <span className="chamados-ops__kpi-l">Índice peso–idade (Σ min(dias,90))</span>
                </div>
                <div className="chamados-ops__kpi" role="listitem">
                  <span className="chamados-ops__kpi-v">{summary.idleGlpiModDays7Plus}</span>
                  <span className="chamados-ops__kpi-l">Sem alteração GLPI há ≥ 7 d</span>
                </div>
                <div className="chamados-ops__kpi" role="listitem">
                  <span className="chamados-ops__kpi-v">{summary.idleGlpiModDays14Plus}</span>
                  <span className="chamados-ops__kpi-l">Sem alteração GLPI há ≥ 14 d</span>
                </div>
                <div className="chamados-ops__kpi chamados-ops__kpi--wide" role="listitem">
                  <span className="chamados-ops__kpi-v">{conc}</span>
                  <span className="chamados-ops__kpi-l">% dos abertos nos 3 grupos (contrato) com mais chamados</span>
                </div>
              </div>

              <div className="chamados-ops__grid">
                <MiniTable title="Pendência inferida" rows={summary.byWaitingParty} />
                <MiniTable title="Por estado (status)" rows={summary.byStatus} />
                <MiniTable title="Top grupos (contrato / GLPI)" rows={summary.topGroups} />
              </div>

              <div className="chamados-ops__grid chamados-ops__grid--single">
                <MiniTable title="Top solicitantes (e-mail ou nome)" rows={summary.topRequesters} />
              </div>

              <div className="chamados-ops__block">
                <h3 className="chamados-ops__block-title">Mais antigos (por data de abertura)</h3>
                <div className="chamados-ops__table-wrap">
                  <table className="chamados-ops__table chamados-ops__table--wide">
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">Assunto</th>
                        <th scope="col" className="chamados-ops__th-num">
                          Dias
                        </th>
                        <th scope="col">Estado</th>
                        <th scope="col">Grupo</th>
                        <th scope="col">Solicitante</th>
                        <th scope="col">Abrir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.oldestTickets.map((t) => (
                        <tr key={t.glpiTicketId}>
                          <td className="chamados-ops__mono">{t.glpiTicketId}</td>
                          <td className="chamados-ops__clip">{t.title?.trim() || "—"}</td>
                          <td className="chamados-ops__td-num">{t.daysOpen}</td>
                          <td className="chamados-ops__clip">{t.status ?? "—"}</td>
                          <td className="chamados-ops__clip">{t.contractGroupName ?? "—"}</td>
                          <td className="chamados-ops__clip">{t.requesterLabel}</td>
                          <td>
                            <Link
                              href={`/chamados?q=${encodeURIComponent(String(t.glpiTicketId))}` as Route}
                              className="chamados-ops__link"
                            >
                              Filtrar
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
