import type { OpenAgeBuckets } from "@/glpi/utils/open-ticket-aging";
import { sumOpenAgeBuckets } from "@/glpi/utils/open-ticket-aging";

const MIN_SWEEP_FOR_LABEL = 0.42;
const LABEL_RADIUS = 0.56;

function formatAgingPercentOfTotal(count: number, total: number): string {
  if (total <= 0) {
    return "—";
  }
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(
    (100 * count) / total
  );
}

function agingPieSliceTitle(label: string, count: number, total: number): string {
  const pct = formatAgingPercentOfTotal(count, total);
  return `${label}: ${count} (${pct}%)`;
}

function AgingDashIcon({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <svg
      className="aging-card__svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function OpenAgePieSvg({ b }: { b: OpenAgeBuckets }): JSX.Element {
  const slices: { n: number; c: string; label: string }[] = [
    { n: b.week, c: "#10b981", label: "Esta semana (ate 7 dias)" },
    { n: b.days15, c: "#14b8a6", label: "8 a 15 dias" },
    { n: b.days30, c: "#f59e0b", label: "16 a 30 dias" },
    { n: b.days60, c: "#f97316", label: "31 a 60 dias" },
    { n: b.over60, c: "#ef4444", label: "Mais de 60 dias" },
    { n: b.noDate, c: "#94a3b8", label: "Sem data de abertura" }
  ];
  const total = slices.reduce((s, x) => s + x.n, 0);
  if (total <= 0) {
    return (
      <svg className="aging-dash__pie-svg" viewBox="-1 -1 2 2" role="img" aria-label="Sem chamados abertos no filtro">
        <title>Sem chamados abertos no filtro</title>
        <circle cx="0" cy="0" r="1" fill="#e2e8f0" />
      </svg>
    );
  }
  const fullIdx = slices.findIndex((x) => x.n === total);
  if (fullIdx >= 0) {
    const s = slices[fullIdx]!;
    const pctStr = `${formatAgingPercentOfTotal(s.n, total)}%`;
    return (
      <svg className="aging-dash__pie-svg" viewBox="-1 -1 2 2" role="img" aria-label="100% numa unica faixa etaria">
        <circle cx="0" cy="0" r="1" fill={s.c}>
          <title>{agingPieSliceTitle(s.label, s.n, total)}</title>
        </circle>
        <text x="0" y="0" className="aging-dash__pie-label" fontSize="0.38" textAnchor="middle" dominantBaseline="middle">
          {pctStr}
        </text>
      </svg>
    );
  }
  const r = 0.98;
  type Seg = { n: number; c: string; label: string; sweep: number; mid: number; tip: string; pctStr: string };
  const segs: Seg[] = [];
  let angle = -Math.PI / 2;
  for (const { n, c, label } of slices) {
    if (n <= 0) continue;
    const sweep = (n / total) * 2 * Math.PI;
    segs.push({
      n,
      c,
      label,
      sweep,
      mid: angle + sweep / 2,
      tip: agingPieSliceTitle(label, n, total),
      pctStr: `${formatAgingPercentOfTotal(n, total)}%`
    });
    angle += sweep;
  }
  const paths: JSX.Element[] = [];
  const labels: JSX.Element[] = [];
  angle = -Math.PI / 2;
  for (const seg of segs) {
    const { sweep, c, tip } = seg;
    const next = angle + sweep;
    const x1 = r * Math.cos(angle);
    const y1 = r * Math.sin(angle);
    const x2 = r * Math.cos(next);
    const y2 = r * Math.sin(next);
    const largeArc = sweep > Math.PI ? 1 : 0;
    paths.push(
      <path
        key={`${c}-${angle}`}
        d={`M 0 0 L ${x1.toFixed(4)} ${y1.toFixed(4)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(4)} ${y2.toFixed(4)} Z`}
        fill={c}
      >
        <title>{tip}</title>
      </path>
    );
    if (sweep >= MIN_SWEEP_FOR_LABEL) {
      const tx = LABEL_RADIUS * Math.cos(seg.mid);
      const ty = LABEL_RADIUS * Math.sin(seg.mid);
      labels.push(
        <text
          key={`l-${seg.mid}`}
          x={tx.toFixed(3)}
          y={ty.toFixed(3)}
          className="aging-dash__pie-label"
          fontSize="0.22"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {seg.pctStr}
        </text>
      );
    }
    angle = next;
  }
  return (
    <svg className="aging-dash__pie-svg" viewBox="-1 -1 2 2" role="img" aria-label="Distribuicao por idade (abertos no filtro)">
      {paths}
      {labels}
    </svg>
  );
}

type AgingTone = "week" | "d15" | "d30" | "d60" | "over";

function AgingCard({
  tone,
  value,
  title,
  hint,
  icon,
  total
}: {
  tone: AgingTone;
  value: number;
  title: string;
  hint: string;
  icon: JSX.Element;
  total: number;
}): JSX.Element {
  const pct = formatAgingPercentOfTotal(value, total);
  const pctHtml =
    total > 0 ? (
      <span className="aging-card__pct" title="Percentual do total de abertos no filtro atual">
        {pct}%
      </span>
    ) : null;
  const ariaLabel = total > 0 ? `${title}: ${value}, ${pct} por cento do total` : `${title}: ${value}`;
  return (
    <div className={`aging-card aging-card--${tone}`} role="listitem" aria-label={ariaLabel}>
      <div className="aging-card__iconwrap">{icon}</div>
      <div className="aging-card__value-row">
        <span className="aging-card__value">{value}</span>
        {pctHtml}
      </div>
      <h3 className="aging-card__title">{title}</h3>
      <p className="aging-card__hint">{hint}</p>
    </div>
  );
}

export function AgingOpenDashboard({ buckets }: { buckets: OpenAgeBuckets }): JSX.Element {
  const total = sumOpenAgeBuckets(buckets);
  const delayedCount = buckets.days15 + buckets.days30 + buckets.days60 + buckets.over60;
  const delayedPctLabel = total > 0 ? formatAgingPercentOfTotal(delayedCount, total) : "—";
  const noDateNote =
    buckets.noDate > 0 ? (
      <span className="aging-dash__nodate" title="Sem data de abertura valida no cache">
        · {buckets.noDate} sem data
      </span>
    ) : null;
  const delayedLine =
    total > 0 ? (
      <span
        className="aging-dash__delayed"
        title='Chamados com mais de 7 dias desde a data de abertura (exclui a faixa "esta semana")'
      >
        <span className="aging-dash__delayed-k">Atraso relativo</span>{" "}
        <span className="aging-dash__delayed-v">{delayedCount}</span>{" "}
        <span className="aging-dash__delayed-p">({delayedPctLabel}% &gt; 7 dias)</span>
      </span>
    ) : null;

  return (
    <section className="aging-dash" aria-labelledby="aging-dash-title">
      <div className="aging-dash__intro">
        <h2 id="aging-dash-title" className="aging-dash__title">
          Idade dos chamados abertos
        </h2>
        <div className="aging-dash__total-row">
          <p className="aging-dash__total">
            <span className="aging-dash__total-num">{total}</span>
            <span className="aging-dash__total-label"> chamados abertos</span>
            {noDateNote}
            {delayedLine}
          </p>
          <div className="aging-dash__pie-wrap">
            <OpenAgePieSvg b={buckets} />
          </div>
        </div>
      </div>
      <div className="aging-dash__grid" role="list">
        <AgingCard
          tone="week"
          value={buckets.week}
          title="Esta semana"
          hint="Abertos ha ate 7 dias"
          total={total}
          icon={
            <AgingDashIcon>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </AgingDashIcon>
          }
        />
        <AgingCard
          tone="d15"
          value={buckets.days15}
          title="A 15 dias"
          hint="Entre 8 e 15 dias abertos"
          total={total}
          icon={
            <AgingDashIcon>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </AgingDashIcon>
          }
        />
        <AgingCard
          tone="d30"
          value={buckets.days30}
          title="A 30 dias"
          hint="Entre 16 e 30 dias abertos"
          total={total}
          icon={
            <AgingDashIcon>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M3 10h18" />
              <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
            </AgingDashIcon>
          }
        />
        <AgingCard
          tone="d60"
          value={buckets.days60}
          title="A 60 dias"
          hint="Entre 31 e 60 dias abertos"
          total={total}
          icon={
            <AgingDashIcon>
              <path d="M18 20V10M12 20V4M6 20v-6" />
              <path d="M4 20h16" />
            </AgingDashIcon>
          }
        />
        <AgingCard
          tone="over"
          value={buckets.over60}
          title="Mais de 60 dias"
          hint="Envelhecidos — priorizar revisao"
          total={total}
          icon={
            <AgingDashIcon>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 9v4M12 17h.01" />
            </AgingDashIcon>
          }
        />
      </div>
    </section>
  );
}
