/** Categorias de status alinhadas ao quadro Monday (cores / agregação). */
export type ProjectTaskStatusKind = "done" | "progress" | "blocked" | "notStarted" | "other" | "empty";

export function normStatus(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
}

/** Início do dia corrente em UTC (comparação de prazos alinhada ao backend). */
export function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Tarefa não concluída com data limite antes de hoje (UTC). */
export function isOverdueNotDoneUtc(dueDateIso: string | null, status: string): boolean {
  if (!dueDateIso) return false;
  if (classifyStatus(status) === "done") return false;
  const t = new Date(dueDateIso);
  if (Number.isNaN(t.getTime())) return false;
  return t < startOfUtcDay();
}

/** Sem data limite e ainda não concluída. */
export function isNoDueNotDoneUtc(dueDateIso: string | null, status: string): boolean {
  if (dueDateIso) return false;
  return classifyStatus(status) !== "done";
}

export function classifyStatus(status: string): ProjectTaskStatusKind {
  const raw = status.trim();
  if (!raw) return "empty";
  const n = normStatus(raw);
  if (n.includes("feito") || n.includes("conclu") || n.includes("done")) return "done";
  if (n.includes("progresso") || n.includes("andamento") || n.includes("progress")) return "progress";
  if (n.includes("parado") || n.includes("bloque") || n.includes("hold")) return "blocked";
  if (n.includes("nao") && n.includes("inici")) return "notStarted";
  return "other";
}

export const STATUS_KIND_COLORS: Record<ProjectTaskStatusKind, { bg: string; fg: string }> = {
  done: { bg: "#33d391", fg: "#ffffff" },
  progress: { bg: "#fdbd64", fg: "#323338" },
  blocked: { bg: "#797e93", fg: "#ffffff" },
  notStarted: { bg: "#c5c7d0", fg: "#323338" },
  other: { bg: "#579bfc", fg: "#ffffff" },
  empty: { bg: "#797e93", fg: "#ffffff" }
};

export const STATUS_KIND_ORDER: ProjectTaskStatusKind[] = [
  "done",
  "progress",
  "notStarted",
  "blocked",
  "other",
  "empty"
];

export const STATUS_KIND_LABEL: Record<ProjectTaskStatusKind, string> = {
  done: "Feito / concluído",
  progress: "Em progresso",
  notStarted: "Não iniciado",
  blocked: "Bloqueado / parado",
  other: "Outros",
  empty: "Sem status"
};

export type ProjectTaskStatusTree = { status: string; children?: ProjectTaskStatusTree[] };

export function aggregateStatusByKind(nodes: ProjectTaskStatusTree[]): Record<ProjectTaskStatusKind, number> {
  const acc: Record<ProjectTaskStatusKind, number> = {
    done: 0,
    progress: 0,
    blocked: 0,
    notStarted: 0,
    other: 0,
    empty: 0
  };
  function walk(t: ProjectTaskStatusTree): void {
    acc[classifyStatus(t.status)]++;
    t.children?.forEach(walk);
  }
  nodes.forEach(walk);
  return acc;
}
