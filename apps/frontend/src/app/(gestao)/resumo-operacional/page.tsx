import { OperationalSummaryView } from "@/components/operational-summary/operational-summary-view";
import { getOperationalSummary, type OperationalSummary, type OperationalSummaryPreset } from "@/lib/api";
import { collectLoadErrors, safeLoad } from "@/lib/api-load";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Search = Record<string, string | string[] | undefined>;

function normalizePreset(raw: string | string[] | undefined): OperationalSummaryPreset {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "yesterday" || value === "week" || value === "month" ? value : "today";
}

const emptySummary: OperationalSummary = {
  period: { preset: "today", from: new Date().toISOString(), to: new Date().toISOString() },
  totals: { openedTickets: 0, closedTickets: 0, completedTasks: 0, contractChanges: 0, totalEvents: 0 },
  eventsByCategory: {},
  openedTickets: [],
  closedTickets: [],
  events: []
};

export default async function OperationalSummaryPage({ searchParams }: { searchParams: Search }): Promise<JSX.Element> {
  const preset = normalizePreset(searchParams.preset);
  const summaryRes = await safeLoad(() => getOperationalSummary({ preset }), emptySummary);
  const loadErrors = collectLoadErrors([summaryRes.error]);

  return <OperationalSummaryView summary={summaryRes.data} selectedPreset={preset} loadErrors={loadErrors} />;
}
