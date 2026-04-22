import { buildFallbackKanbanBoardPayload, loadKanbanBoardPayload } from "@/glpi/kanban-load";
import { ChamadosBoard } from "./chamados-board";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Search = Record<string, string | string[] | undefined>;

function buildSearchParams(raw: Search): URLSearchParams {
  const sp = new URLSearchParams();
  const keys = [
    "q",
    "status",
    "group",
    "open",
    "pendencia",
    "requesterEmail",
    "requesterName",
    "assignedUserId",
    "cohort",
    "idleMin",
    "groupInJson",
    "groupNull"
  ] as const;
  for (const key of keys) {
    const v = raw[key];
    if (v === undefined) continue;
    const s = Array.isArray(v) ? v[0] : v;
    if (s) sp.set(key, s);
  }
  return sp;
}

export default async function ChamadosPage({ searchParams }: { searchParams: Search }): Promise<JSX.Element> {
  const sp = buildSearchParams(searchParams);
  let payload = buildFallbackKanbanBoardPayload(sp);
  let loadError: string | null = null;
  try {
    payload = await loadKanbanBoardPayload(sp);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  const boardKey = sp.toString();
  return (
    <div className="chamados-glpi-page gti-exec-metric-dash">
      <header className="page-header">
        <p className="page-kicker">Operação · GLPI</p>
        <h1 className="page-title">Quadro de chamados</h1>
        <p className="page-lead">Acompanhe o Kanban operacional com filtros, pendências e detalhamento de chamados.</p>
      </header>
      {loadError ? (
        <div className="chamados-load-error" role="alert">
          <strong>Não foi possível carregar o quadro.</strong> Verifique <code>DATABASE_URL</code>, migrações Prisma e a
          ligação ao PostgreSQL. Detalhes: {loadError}
        </div>
      ) : null}
      <ChamadosBoard key={boardKey} initial={payload} />
    </div>
  );
}
