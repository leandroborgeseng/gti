import { prisma } from "./config/prisma";

const KANBAN_SETTINGS_KEY = "kanban_settings";

export type KanbanSettings = {
  columnOrder?: string[];
  columnColors?: Record<string, string>;
};

export function sanitizeCssColor(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%(\s*,\s*[\d.]+)?\s*\)$/.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

export function mergeColumnOrder(saved: string[] | undefined, discovered: string[]): string[] {
  const cleaned = (saved || []).filter((item) => discovered.includes(item));
  const tail = discovered.filter((item) => !cleaned.includes(item));
  return [...cleaned, ...tail];
}

export async function readKanbanSettings(): Promise<KanbanSettings> {
  const row = await prisma.syncState.findUnique({ where: { key: KANBAN_SETTINGS_KEY } });
  if (!row?.value) {
    return {};
  }
  try {
    const parsed = JSON.parse(row.value) as KanbanSettings;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const sanitized: KanbanSettings = { ...parsed };
    if (sanitized.columnColors) {
      const nextColors: Record<string, string> = {};
      for (const [key, value] of Object.entries(sanitized.columnColors)) {
        if (typeof value !== "string") {
          continue;
        }
        const safe = sanitizeCssColor(value);
        if (safe) {
          nextColors[key] = safe;
        }
      }
      sanitized.columnColors = nextColors;
    }
    return sanitized;
  } catch {
    return {};
  }
}

export async function writeKanbanSettings(settings: KanbanSettings): Promise<void> {
  await prisma.syncState.upsert({
    where: { key: KANBAN_SETTINGS_KEY },
    update: { value: JSON.stringify(settings) },
    create: { key: KANBAN_SETTINGS_KEY, value: JSON.stringify(settings) }
  });
}

/** Mescla o corpo JSON (parcial) com as definições atuais e persiste. */
export async function mergeKanbanSettingsFromRequestBody(body: unknown): Promise<KanbanSettings> {
  if (!body || typeof body !== "object") {
    throw new Error("JSON inválido");
  }
  const incoming = body as KanbanSettings;
  const current = await readKanbanSettings();
  const next: KanbanSettings = { ...current };
  if (Array.isArray(incoming.columnOrder)) {
    next.columnOrder = incoming.columnOrder.filter((item) => typeof item === "string");
  }
  if (incoming.columnColors && typeof incoming.columnColors === "object") {
    const merged: Record<string, string> = { ...(next.columnColors || {}) };
    for (const [key, value] of Object.entries(incoming.columnColors)) {
      if (typeof key === "string" && typeof value === "string" && value.trim().length > 0) {
        const safe = sanitizeCssColor(value);
        if (safe) {
          merged[key] = safe;
        }
      }
    }
    next.columnColors = merged;
  }
  await writeKanbanSettings(next);
  return next;
}
