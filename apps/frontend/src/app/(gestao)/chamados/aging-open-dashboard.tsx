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

type PieSliceTitles = {
  week: string;
  days15: string;
  days30: string;
  days60: string;
  over60: string;
  noDate: string;
};

function OpenDistributionPieSvg({
  b,
  titles,
  emptyAria,
  ariaLabel
}: {
  b: OpenAgeBuckets;
  titles: PieSliceTitles;
  emptyAria: string;
  ariaLabel: string;
}): JSX.Element {
  const slices: { n: number; c: string; label: string }[] = [
    { n: b.week, c: "#10b981", label: titles.week },
    { n: b.days15, c: "#14b8a6", label: titles.days15 },
    { n: b.days30, c: "#f59e0b", label: titles.days30 },
    { n: b.days60, c: "#f97316", label: titles.days60 },
    { n: b.over60, c: "#ef4444", label: titles.over60 },
    { n: b.noDate, c: "#94a3b8", label: titles.noDate }
  ];
  const total = slices.reduce((s, x) => s + x.n, 0);
  if (total <= 0) {
    return (
      <svg className="aging-dash__pie-svg" viewBox="-1 -1 2 2" role="img" aria-label={emptyAria}>
        <title>{emptyAria}</title>
        <circle cx="0" cy="0" r="1" fill="#e2e8f0" />
      </svg>
    );
  }
  const fullIdx = slices.findIndex((x) => x.n === total);
  if (fullIdx >= 0) {
    const s = slices[fullIdx]!;
    const pctStr = `${formatAgingPercentOfTotal(s.n, total)}%`;
    return (
      <svg className="aging-dash__pie-svg" viewBox="-1 -1 2 2" role="img" aria-label="100% em uma unica faixa">
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
    <svg className="aging-dash__pie-svg" viewBox="-1 -1 2 2" role="img" aria-label={ariaLabel}>
      {paths}
      {labels}
    </svg>
  );
}

type AgingTone = "week" | "d15" | "d30" | "d60" | "over";
type AgingBucketKey = "week" | "days15" | "days30" | "days60" | "over60";

function AgingCard({
  tone,
  value,
  title,
  hint,
  icon,
  total,
  href,
  active,
  filterAriaHint
}: {
  tone: AgingTone;
  value: number;
  title: string;
  hint: string;
  icon: JSX.Element;
  total: number;
  href: string;
  active: boolean;
  filterAriaHint: string;
}): JSX.Element {
  const pct = formatAgingPercentOfTotal(value, total);
  const pctHtml =
    total > 0 ? (
      <span className="aging-card__pct" title="Percentual do total de abertos no filtro atual">
        {pct}%
      </span>
    ) : null;
  const ariaLabel = total > 0 ? `${title}: ${value}, ${pct} por cento do total` : `${title}: ${value}`;
  const className = `aging-card aging-card--${tone}${active ? " is-active" : ""}`;
  const content = (
    <>
      <div className="aging-card__iconwrap">{icon}</div>
      <div className="aging-card__value-row">
        <span className="aging-card__value">{value}</span>
        {pctHtml}
      </div>
      <h3 className="aging-card__title">{title}</h3>
      <p className="aging-card__hint">{hint}</p>
    </>
  );
  return (
    <a className={className} href={href} role="listitem" aria-label={`${ariaLabel}. ${filterAriaHint}`}>
      {content}
    </a>
  );
}

function bucketHref(currentQuery: string, bucket: AgingBucketKey, queryParamName: "ageBucket" | "idleBucket"): string {
  const sp = new URLSearchParams(currentQuery);
  sp.set("open", "1");
  sp.set(queryParamName, bucket);
  const qs = sp.toString();
  return qs ? `/chamados?${qs}` : "/chamados";
}

export type TicketDistributionDashboardProps = {
  sectionDomId: string;
  sectionTitle: string;
  buckets: OpenAgeBuckets;
  kanbanHrefQuery: string;
  activeBucketParam: string;
  queryParamName: "ageBucket" | "idleBucket";
  pieAriaLabel: string;
  emptyPieAria: string;
  pieSliceTitles: PieSliceTitles;
  delayedRelativeTooltip: string;
  delayedRelativeLabel: string;
  delayedRelativePastDaysTitle: string;
  noDateNoteTitle: string;
  filterAriaHint: string;
  cards: Array<{ bucket: AgingBucketKey; title: string; hint: string; tone: AgingTone; icon: JSX.Element }>;
};

export function TicketDistributionDashboard({
  sectionDomId,
  sectionTitle,
  buckets,
  kanbanHrefQuery,
  activeBucketParam,
  queryParamName,
  pieAriaLabel,
  emptyPieAria,
  pieSliceTitles,
  delayedRelativeTooltip,
  delayedRelativeLabel,
  delayedRelativePastDaysTitle,
  noDateNoteTitle,
  filterAriaHint,
  cards
}: TicketDistributionDashboardProps): JSX.Element {
  const total = sumOpenAgeBuckets(buckets);
  const delayedCount = buckets.days15 + buckets.days30 + buckets.days60 + buckets.over60;
  const delayedPctLabel = total > 0 ? formatAgingPercentOfTotal(delayedCount, total) : "—";
  const noDateNote =
    buckets.noDate > 0 ? (
      <span className="aging-dash__nodate" title={noDateNoteTitle}>
        · {buckets.noDate} sem data
      </span>
    ) : null;
  const delayedLine =
    total > 0 ? (
      <span className="aging-dash__delayed" title={delayedRelativeTooltip}>
        <span className="aging-dash__delayed-k">{delayedRelativeLabel}</span>{" "}
        <span className="aging-dash__delayed-v">{delayedCount}</span>{" "}
        <span className="aging-dash__delayed-p" title={delayedRelativePastDaysTitle}>
          ({delayedPctLabel}% &gt; 7 dias)
        </span>
      </span>
    ) : null;

  return (
    <section className="aging-dash" aria-labelledby={sectionDomId}>
      <div className="aging-dash__intro">
        <h2 id={sectionDomId} className="aging-dash__title">
          {sectionTitle}
        </h2>
        <div className="aging-dash__total-row">
          <p className="aging-dash__total">
            <span className="aging-dash__total-num">{total}</span>
            <span className="aging-dash__total-label"> chamados abertos</span>
            {noDateNote}
            {delayedLine}
          </p>
          <div className="aging-dash__pie-wrap">
            <OpenDistributionPieSvg b={buckets} titles={pieSliceTitles} emptyAria={emptyPieAria} ariaLabel={pieAriaLabel} />
          </div>
        </div>
      </div>
      <div className="aging-dash__grid aging-dash__grid--cols-5" role="list">
        {cards.map((c) => (
          <AgingCard
            key={c.bucket}
            tone={c.tone}
            value={buckets[c.bucket]}
            title={c.title}
            hint={c.hint}
            total={total}
            href={bucketHref(kanbanHrefQuery, c.bucket, queryParamName)}
            active={activeBucketParam === c.bucket}
            icon={c.icon}
            filterAriaHint={filterAriaHint}
          />
        ))}
      </div>
    </section>
  );
}

const SHARED_CARD_ICONS: Record<AgingBucketKey, JSX.Element> = {
  week: (
    <AgingDashIcon>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </AgingDashIcon>
  ),
  days15: (
    <AgingDashIcon>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </AgingDashIcon>
  ),
  days30: (
    <AgingDashIcon>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </AgingDashIcon>
  ),
  days60: (
    <AgingDashIcon>
      <path d="M18 20V10M12 20V4M6 20v-6" />
      <path d="M4 20h16" />
    </AgingDashIcon>
  ),
  over60: (
    <AgingDashIcon>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </AgingDashIcon>
  )
};

const AGE_PIE_TITLES: PieSliceTitles = {
  week: "Esta semana (até 7 dias)",
  days15: "8 a 15 dias",
  days30: "16 a 30 dias",
  days60: "31 a 60 dias",
  over60: "Mais de 60 dias",
  noDate: "Sem data de abertura"
};

const IDLE_PIE_TITLES: PieSliceTitles = {
  week: "Última alteração GLPI há até 7 dias",
  days15: "8 a 15 dias sem nova alteração GLPI",
  days30: "16 a 30 dias sem nova alteração GLPI",
  days60: "31 a 60 dias sem nova alteração GLPI",
  over60: "Mais de 60 dias sem nova alteração GLPI",
  noDate: "Sem data de abertura utilizável no cache"
};

const AGE_CARDS: TicketDistributionDashboardProps["cards"] = [
  {
    bucket: "week",
    title: "Esta semana",
    hint: "Abertos há até 7 dias",
    tone: "week",
    icon: SHARED_CARD_ICONS.week
  },
  {
    bucket: "days15",
    title: "Há 15 dias",
    hint: "Entre 8 e 15 dias abertos",
    tone: "d15",
    icon: SHARED_CARD_ICONS.days15
  },
  {
    bucket: "days30",
    title: "Há 30 dias",
    hint: "Entre 16 e 30 dias abertos",
    tone: "d30",
    icon: SHARED_CARD_ICONS.days30
  },
  {
    bucket: "days60",
    title: "Há 60 dias",
    hint: "Entre 31 e 60 dias abertos",
    tone: "d60",
    icon: SHARED_CARD_ICONS.days60
  },
  {
    bucket: "over60",
    title: "Mais de 60 dias",
    hint: "Envelhecidos — priorizar revisão",
    tone: "over",
    icon: SHARED_CARD_ICONS.over60
  }
];

const IDLE_CARDS: TicketDistributionDashboardProps["cards"] = [
  {
    bucket: "week",
    title: "Esta semana",
    hint: "Última alteração GLPI há até 7 dias",
    tone: "week",
    icon: SHARED_CARD_ICONS.week
  },
  {
    bucket: "days15",
    title: "Há 15 dias",
    hint: "Entre 8 e 15 dias sem nova alteração GLPI",
    tone: "d15",
    icon: SHARED_CARD_ICONS.days15
  },
  {
    bucket: "days30",
    title: "Há 30 dias",
    hint: "Entre 16 e 30 dias sem nova alteração GLPI",
    tone: "d30",
    icon: SHARED_CARD_ICONS.days30
  },
  {
    bucket: "days60",
    title: "Há 60 dias",
    hint: "Entre 31 e 60 dias sem nova alteração GLPI",
    tone: "d60",
    icon: SHARED_CARD_ICONS.days60
  },
  {
    bucket: "over60",
    title: "Mais de 60 dias",
    hint: "Sem alteração GLPI há mais de 60 dias — priorizar revisão",
    tone: "over",
    icon: SHARED_CARD_ICONS.over60
  }
];

export function AgingOpenDashboard({
  buckets,
  kanbanHrefQuery,
  activeAgeBucket
}: {
  buckets: OpenAgeBuckets;
  kanbanHrefQuery: string;
  activeAgeBucket: string;
}): JSX.Element {
  return (
    <TicketDistributionDashboard
      sectionDomId="aging-dash-title"
      sectionTitle="Idade dos chamados abertos"
      buckets={buckets}
      kanbanHrefQuery={kanbanHrefQuery}
      activeBucketParam={activeAgeBucket}
      queryParamName="ageBucket"
      pieAriaLabel="Distribuição por idade dos chamados abertos no filtro atual"
      emptyPieAria="Sem chamados abertos no filtro"
      pieSliceTitles={AGE_PIE_TITLES}
      delayedRelativeTooltip='Chamados com mais de 7 dias desde a data de abertura (exclui a faixa «esta semana»)'
      delayedRelativeLabel="Atraso relativo"
      delayedRelativePastDaysTitle="Parte do total com mais de 7 dias desde a abertura"
      noDateNoteTitle="Sem data de abertura válida no cache"
      filterAriaHint="Filtrar por esta faixa de idade."
      cards={AGE_CARDS}
    />
  );
}

export function IdleSinceIterationDashboard({
  buckets,
  kanbanHrefQuery,
  activeIdleBucket
}: {
  buckets: OpenAgeBuckets;
  kanbanHrefQuery: string;
  activeIdleBucket: string;
}): JSX.Element {
  return (
    <TicketDistributionDashboard
      sectionDomId="idle-iteration-dash-title"
      sectionTitle="Tempo desde a última interação"
      buckets={buckets}
      kanbanHrefQuery={kanbanHrefQuery}
      activeBucketParam={activeIdleBucket}
      queryParamName="idleBucket"
      pieAriaLabel="Distribuição por dias desde a última alteração GLPI no filtro atual"
      emptyPieAria="Sem chamados abertos no filtro"
      pieSliceTitles={IDLE_PIE_TITLES}
      delayedRelativeTooltip="Chamados cuja última alteração no GLPI foi há mais de 7 dias (contagem inteira; exclui a faixa «esta semana» deste painel)."
      delayedRelativeLabel="Inatividade relativa"
      delayedRelativePastDaysTitle="Parte do total com mais de 7 dias desde a última alteração GLPI"
      noDateNoteTitle="Sem data de abertura válida no cache para este indicador"
      filterAriaHint="Filtrar por esta faixa de tempo desde a última alteração GLPI."
      cards={IDLE_CARDS}
    />
  );
}
