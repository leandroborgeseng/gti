import type { Route } from "next";
import Link from "next/link";
import type { OperationalSummary, OperationalSummaryEvent, OperationalSummaryPreset, OperationalSummaryTicket } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";

const presetLabels: Record<OperationalSummaryPreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  week: "Últimos 7 dias",
  month: "Últimos 30 dias"
};

const categoryLabels: Record<string, string> = {
  GLPI: "Chamados GLPI",
  PROJECTS: "Projetos",
  CONTRACTS: "Contratos",
  MEASUREMENTS: "Medições",
  USERS: "Usuários",
  SYSTEM: "Sistema"
};

function formatDateTime(value?: string | null): string {
  if (!value) return "Sem data";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-BR");
}

function KpiCard({ label, value, hint }: { label: string; value: number; hint: string }): JSX.Element {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function TicketList({ title, tickets, empty }: { title: string; tickets: OperationalSummaryTicket[]; empty: string }): JSX.Element {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {tickets.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {tickets.slice(0, 10).map((ticket) => (
            <li key={`${title}-${ticket.glpiTicketId}`} className="rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-foreground">#{ticket.glpiTicketId} · {ticket.title || "Chamado sem título"}</p>
                <span className="text-xs text-muted-foreground">{formatDateTime(ticket.occurredAt)}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {ticket.status || "Sem status"} · {ticket.assignedUserName || "Sem técnico"} · {ticket.contractGroupName || "Sem grupo"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EventList({ events }: { events: OperationalSummaryEvent[] }): JSX.Element {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-foreground">Eventos registrados no sistema</h2>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhuma mudança interna registrada neste período. Os eventos começam a aparecer a partir desta versão.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {events.slice(0, 25).map((event) => (
            <li key={event.id} className="rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                    {categoryLabels[event.category] ?? event.category}
                  </span>
                  <p className="mt-2 font-medium text-foreground">{event.title}</p>
                </div>
                <span className="text-xs text-muted-foreground">{formatDateTime(event.occurredAt)}</span>
              </div>
              {event.description ? <p className="mt-1 text-sm text-muted-foreground">{event.description}</p> : null}
              <p className="mt-2 text-xs text-muted-foreground">Responsável: {event.actorLabel || "system"}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function OperationalSummaryView({
  summary,
  selectedPreset,
  loadErrors = []
}: {
  summary: OperationalSummary;
  selectedPreset: OperationalSummaryPreset;
  loadErrors?: string[];
}): JSX.Element {
  const periodLabel = `${formatDate(summary.period.from)} até ${formatDate(summary.period.to)}`;

  return (
    <div className="space-y-6">
      {loadErrors.length > 0 ? <DataLoadAlert title="Resumo incompleto" messages={loadErrors} /> : null}

      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Operação</p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Resumo operacional</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Acompanhe o que a equipe produziu no período: chamados abertos e fechados, tarefas concluídas e mudanças
              relevantes em contratos e projetos.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Período: {periodLabel}</p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Período do resumo operacional">
            {(Object.keys(presetLabels) as OperationalSummaryPreset[]).map((preset) => (
              <Link
                key={preset}
                href={`/resumo-operacional?preset=${preset}` as Route}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  selectedPreset === preset ? "bg-foreground text-background" : "bg-background text-foreground hover:bg-muted"
                }`}
              >
                {presetLabels[preset]}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Chamados abertos" value={summary.totals.openedTickets} hint="Abertura no GLPI" />
        <KpiCard label="Chamados fechados" value={summary.totals.closedTickets} hint="Fechamento inferido pelo status" />
        <KpiCard label="Tarefas concluídas" value={summary.totals.completedTasks} hint="Projetos" />
        <KpiCard label="Mudanças em contratos" value={summary.totals.contractChanges} hint="Status, módulos e itens" />
        <KpiCard label="Eventos totais" value={summary.totals.totalEvents} hint="Produção registrada" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <TicketList title="Ordens de serviço abertas" tickets={summary.openedTickets} empty="Nenhum chamado aberto no período." />
        <TicketList title="Ordens de serviço fechadas" tickets={summary.closedTickets} empty="Nenhum chamado fechado no período." />
      </section>

      <EventList events={summary.events} />
    </div>
  );
}
