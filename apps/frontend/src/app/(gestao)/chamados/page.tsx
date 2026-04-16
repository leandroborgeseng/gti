import { loadKanbanBoardPayload } from "@/glpi/kanban-load";
import { ChamadosBoard } from "./chamados-board";

type Search = Record<string, string | string[] | undefined>;

function buildSearchParams(raw: Search): URLSearchParams {
  const sp = new URLSearchParams();
  const keys = ["q", "status", "group", "open", "pendencia"] as const;
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
  const payload = await loadKanbanBoardPayload(sp);
  const boardKey = sp.toString();
  return (
    <div className="space-y-2">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Chamados GLPI</h1>
        <p className="mt-1 text-sm text-slate-600">Quadro Kanban sincronizado com o cache local (mesmo processo Next.js).</p>
      </header>
      <ChamadosBoard key={boardKey} initial={payload} />
    </div>
  );
}
