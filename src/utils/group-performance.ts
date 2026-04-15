import { isTicketClosedStatus } from "./ticket-status";

const DAY_MS = 86400000;
/** Janela principal para criados, fechados e lead time (dias). */
const WINDOW_PERF_DAYS = 90;
const WINDOW_PERF_MS = WINDOW_PERF_DAYS * DAY_MS;
const WEEK_MS = 7 * DAY_MS;
/** Semanas no histograma de fechamentos (13×7 d; fechos contados só na janela de performance). */
const THROUGHPUT_N_WEEKS = 13;

export type PerfAgeSegment = {
  week: number;
  d15: number;
  d30: number;
  d60: number;
  over: number;
};

export type GroupPerformanceRow = {
  groupLabel: string;
  backlogOpen: number;
  backlogAge: PerfAgeSegment;
  opened90d: number;
  closed90d: number;
  netClosedVsOpened90: number;
  medianLeadDaysClosed90: number | null;
  p90LeadDaysClosed90: number | null;
  /** Índice 0 = semana mais antiga (~91–84 d), último = últimos 7 dias. */
  throughputWeeks: number[];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function extractCloseIsoFromTicket(rawJson: unknown, dateModification: string | null): string | null {
  const raw = asRecord(rawJson);
  const candidates = [raw.solvedate, raw.closedate, raw.date_solve, raw.solutiondate];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return c.trim();
    }
  }
  return dateModification?.trim() || null;
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) {
    return null;
  }
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function floorAgeDaysOpen(dateCreation: string | null, nowMs: number): number | null {
  if (!dateCreation?.trim()) {
    return null;
  }
  const t = Date.parse(dateCreation);
  if (!Number.isFinite(t)) {
    return null;
  }
  return Math.floor((nowMs - t) / DAY_MS);
}

function pushAgeSegment(seg: PerfAgeSegment, days: number): void {
  if (days <= 7) {
    seg.week += 1;
  } else if (days <= 15) {
    seg.d15 += 1;
  } else if (days <= 30) {
    seg.d30 += 1;
  } else if (days <= 60) {
    seg.d60 += 1;
  } else {
    seg.over += 1;
  }
}

function emptyAge(): PerfAgeSegment {
  return { week: 0, d15: 0, d30: 0, d60: 0, over: 0 };
}

function medianSorted(sorted: number[]): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function p90Sorted(sorted: number[]): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const idx = Math.ceil(0.9 * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function groupKey(contractGroupName: string | null): string {
  const t = (contractGroupName || "").trim();
  return t.length > 0 ? t : "Sem grupo";
}

function emptyThroughputWeeks(): number[] {
  return Array.from({ length: THROUGHPUT_N_WEEKS }, () => 0);
}

/** Rótulos “dias atrás” para cada fatia do histograma (índice 0 = mais antigo). */
function throughputBinLabels(): string[] {
  const n = THROUGHPUT_N_WEEKS;
  const labels: string[] = [];
  for (let j = 0; j < n; j += 1) {
    const hi = (n - j) * 7;
    const lo = Math.max(0, (n - 1 - j) * 7);
    labels.push(`−${hi}…−${lo} d`);
  }
  return labels;
}

/** Mais performático primeiro: maior saldo fechos−criações, lead mais baixo, mais fechos, P90 menor, menos backlog. */
function compareGroupPerformanceBestFirst(a: GroupPerformanceRow, b: GroupPerformanceRow): number {
  const netA = a.netClosedVsOpened90;
  const netB = b.netClosedVsOpened90;
  if (netB !== netA) {
    return netB - netA;
  }
  const medA = a.medianLeadDaysClosed90 ?? Number.POSITIVE_INFINITY;
  const medB = b.medianLeadDaysClosed90 ?? Number.POSITIVE_INFINITY;
  if (medA !== medB) {
    return medA - medB;
  }
  if (b.closed90d !== a.closed90d) {
    return b.closed90d - a.closed90d;
  }
  const p90a = a.p90LeadDaysClosed90 ?? Number.POSITIVE_INFINITY;
  const p90b = b.p90LeadDaysClosed90 ?? Number.POSITIVE_INFINITY;
  if (p90a !== p90b) {
    return p90a - p90b;
  }
  if (a.backlogOpen !== b.backlogOpen) {
    return a.backlogOpen - b.backlogOpen;
  }
  return a.groupLabel.localeCompare(b.groupLabel, "pt-BR");
}

export type TicketPerfInput = {
  contractGroupName: string | null;
  status: string | null;
  dateCreation: string | null;
  dateModification: string | null;
  rawJson: unknown;
};

export function computeGroupPerformance(tickets: TicketPerfInput[], nowMs: number = Date.now()): GroupPerformanceRow[] {
  type Acc = {
    backlogAge: PerfAgeSegment;
    backlogOpen: number;
    opened90d: number;
    closed90d: number;
    leads90: number[];
    weekClosed: number[];
  };

  const map = new Map<string, Acc>();

  const ensure = (k: string): Acc => {
    let a = map.get(k);
    if (!a) {
      a = {
        backlogAge: emptyAge(),
        backlogOpen: 0,
        opened90d: 0,
        closed90d: 0,
        leads90: [],
        weekClosed: emptyThroughputWeeks()
      };
      map.set(k, a);
    }
    return a;
  };

  const tWin = nowMs - WINDOW_PERF_MS;

  for (const t of tickets) {
    const g = groupKey(t.contractGroupName);
    const acc = ensure(g);
    const createdMs = parseMs(t.dateCreation);
    const closedIso = extractCloseIsoFromTicket(t.rawJson, t.dateModification);
    const closedMs = parseMs(closedIso);
    const closed = isTicketClosedStatus(t.status);

    if (createdMs !== null && createdMs >= tWin && createdMs <= nowMs) {
      acc.opened90d += 1;
    }

    if (closed && closedMs !== null && closedMs >= tWin && closedMs <= nowMs) {
      acc.closed90d += 1;
      if (createdMs !== null && closedMs >= createdMs) {
        const leadDays = Math.floor((closedMs - createdMs) / DAY_MS);
        acc.leads90.push(leadDays);
      }
      for (let k = 0; k < THROUGHPUT_N_WEEKS; k += 1) {
        const end = nowMs - k * WEEK_MS;
        const start = end - WEEK_MS;
        if (closedMs >= start && closedMs < end) {
          acc.weekClosed[THROUGHPUT_N_WEEKS - 1 - k] += 1;
          break;
        }
      }
    }

    if (!closed) {
      acc.backlogOpen += 1;
      const days = floorAgeDaysOpen(t.dateCreation, nowMs);
      if (days !== null && days >= 0) {
        pushAgeSegment(acc.backlogAge, days);
      }
    }
  }

  const rows: GroupPerformanceRow[] = [];
  for (const [groupLabel, acc] of map) {
    const leadsSorted = [...acc.leads90].sort((a, b) => a - b);
    rows.push({
      groupLabel,
      backlogOpen: acc.backlogOpen,
      backlogAge: acc.backlogAge,
      opened90d: acc.opened90d,
      closed90d: acc.closed90d,
      netClosedVsOpened90: acc.closed90d - acc.opened90d,
      medianLeadDaysClosed90: medianSorted(leadsSorted),
      p90LeadDaysClosed90: p90Sorted(leadsSorted),
      throughputWeeks: acc.weekClosed
    });
  }

  rows.sort(compareGroupPerformanceBestFirst);

  return rows;
}

const perfLeadHtml = `Comparação no <strong>cache local</strong>: backlog aberto por idade; criados, fechados e lead time (mediana e P90) na janela dos últimos <strong>${WINDOW_PERF_DAYS} dias</strong>; fechamentos por <strong>semana</strong> (${THROUGHPUT_N_WEEKS} barras, mesma janela). Grupo = <code>contractGroupName</code> do ticket (mesmo rótulo do card). Linhas do <strong>mais ao menos performático</strong>: maior saldo (fechados−criados), menor mediana de dias até fechar, mais fechados na janela, menor P90, menor backlog aberto.`;

export function renderGroupPerformanceSection(
  rows: GroupPerformanceRow[],
  escapeHtml: (s: string) => string,
  /** Sem título duplicado (conteúdo dentro de sanfona). */
  asAccordionContent = false
): string {
  if (rows.length === 0) {
    if (asAccordionContent) {
      return `<div class="perf-section perf-section--accordion-body"><p class="small muted">Sem dados de grupo no cache para comparar.</p></div>`;
    }
    return `<section class="perf-section" aria-labelledby="perf-title">
      <h2 id="perf-title" class="perf-section__title">Performance por grupo</h2>
      <p class="small muted">Sem dados de grupo no cache para comparar.</p>
    </section>`;
  }

  const maxWeek = Math.max(1, ...rows.flatMap((r) => r.throughputWeeks));
  const weekBinLabels = throughputBinLabels();

  const barStack = (age: PerfAgeSegment, total: number): string => {
    if (total <= 0) {
      return '<div class="perf-stack perf-stack--empty">—</div>';
    }
    const parts = [
      { n: age.week, cls: "perf-stack__w" },
      { n: age.d15, cls: "perf-stack__15" },
      { n: age.d30, cls: "perf-stack__30" },
      { n: age.d60, cls: "perf-stack__60" },
      { n: age.over, cls: "perf-stack__ov" }
    ];
    return `<div class="perf-stack" title="Idade do backlog aberto">${parts
      .map((p) => {
        const pct = (p.n / total) * 100;
        return pct > 0 ? `<span class="perf-stack__seg ${p.cls}" style="width:${pct.toFixed(2)}%"></span>` : "";
      })
      .join("")}</div>`;
  };

  const weekBars = (w: number[]): string => {
    return `<div class="perf-weeks" role="img" aria-label="Fechados por semana (${THROUGHPUT_N_WEEKS} semanas)">${w
      .map((n, i) => {
        const h = maxWeek > 0 ? Math.round((n / maxWeek) * 100) : 0;
        const lab = weekBinLabels[i] ?? "";
        return `<div class="perf-week" title="${escapeHtml(lab)}: ${n} fechados"><span class="perf-week__bar" style="height:${h}%"></span><span class="perf-week__n">${n}</span></div>`;
      })
      .join("")}</div>`;
  };

  const tableRows = rows
    .map((r) => {
      const net = r.netClosedVsOpened90;
      const netCls = net > 0 ? "perf-net--pos" : net < 0 ? "perf-net--neg" : "perf-net--zero";
      const med = r.medianLeadDaysClosed90 != null ? String(Math.round(r.medianLeadDaysClosed90 * 10) / 10) : "—";
      const p90 = r.p90LeadDaysClosed90 != null ? String(Math.round(r.p90LeadDaysClosed90 * 10) / 10) : "—";
      return `<tr>
        <td class="perf-td perf-td--name">${escapeHtml(r.groupLabel)}</td>
        <td class="perf-td perf-td--stack">${barStack(r.backlogAge, r.backlogOpen)}<span class="perf-td__sub">${r.backlogOpen} abertos</span></td>
        <td class="perf-td perf-num">${r.opened90d}</td>
        <td class="perf-td perf-num">${r.closed90d}</td>
        <td class="perf-td perf-num ${netCls}">${net > 0 ? "+" : ""}${net}</td>
        <td class="perf-td perf-num">${med}</td>
        <td class="perf-td perf-num">${p90}</td>
        <td class="perf-td perf-td--weeks">${weekBars(r.throughputWeeks)}</td>
      </tr>`;
    })
    .join("");

  const tableBlock = `<div class="perf-table-wrap">
      <table class="perf-table">
        <thead>
          <tr>
            <th>Grupo</th>
            <th>Backlog aberto (idade)</th>
            <th>Criados<br/><span class="perf-th-sub">${WINDOW_PERF_DAYS} d</span></th>
            <th>Fechados<br/><span class="perf-th-sub">${WINDOW_PERF_DAYS} d</span></th>
            <th>Saldo<br/><span class="perf-th-sub">F−C (${WINDOW_PERF_DAYS} d)</span></th>
            <th>Mediana<br/><span class="perf-th-sub">dias até fechar</span></th>
            <th>P90<br/><span class="perf-th-sub">dias</span></th>
            <th>Throughput<br/><span class="perf-th-sub">${THROUGHPUT_N_WEEKS} sem.</span></th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  if (asAccordionContent) {
    return `<div class="perf-section perf-section--accordion-body">
      <p class="perf-section__lead perf-section__lead--accordion">${perfLeadHtml}</p>
      ${tableBlock}
    </div>`;
  }

  return `<section class="perf-section" aria-labelledby="perf-title">
    <div class="perf-section__head">
      <h2 id="perf-title" class="perf-section__title">Performance por grupo atribuído</h2>
      <p class="perf-section__lead">${perfLeadHtml}</p>
    </div>
    ${tableBlock}
  </section>`;
}
