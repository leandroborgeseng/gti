"use client";

import type { Route } from "next";
import Link from "next/link";
import type { ChamadosOperationsSummary, ChamadosRankRow } from "@/glpi/kanban-load";

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

export function ChamadosOperationsPanel({ summary }: { summary: ChamadosOperationsSummary }): JSX.Element {
  const conc =
    summary.concentrationTop3GroupsPct != null
      ? `${summary.concentrationTop3GroupsPct}%`
      : "—";

  return (
    <section className="chamados-ops" aria-labelledby="chamados-ops-title">
      <div className="chamados-ops__intro">
        <h2 id="chamados-ops-title" className="chamados-ops__title">
          Indicadores de operação
        </h2>
        <p className="chamados-ops__lede">
          Mesmos filtros do Kanban e do painel de idade: apenas chamados <strong>não fechados</strong> no cache. Útil para
          priorizar stock antigo, grupos (GLPI/contrato) e solicitantes.
        </p>
      </div>

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
    </section>
  );
}
