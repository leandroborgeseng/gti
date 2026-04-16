export function asJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 ? n : null;
  }
  return null;
}

function toLabel(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const lbl = o.label ?? o.name ?? o.title ?? o.completename;
    if (typeof lbl === "string" && lbl.trim()) {
      return lbl.trim();
    }
  }
  return null;
}

function pushUnique(target: string[], value: string | null): void {
  if (!value) return;
  if (!target.includes(value)) target.push(value);
}

export function extractTicketContext(rawUnknown: unknown): {
  groups: string[];
  assignees: string[];
  category: string | null;
  entity: string | null;
} {
  const raw = asJsonRecord(rawUnknown);
  const groups: string[] = [];
  const assignees: string[] = [];

  pushUnique(groups, toLabel(raw.groups_id_assign_name ?? raw.groups_id_assigned_name ?? raw.assigned_group_name));
  const assignedGroups = raw.assigned_groups;
  if (Array.isArray(assignedGroups)) {
    for (const row of assignedGroups) {
      const o = asJsonRecord(row);
      pushUnique(groups, toLabel(o.name ?? o.group_name ?? o.completename));
    }
  }
  const team = raw.team;
  if (Array.isArray(team)) {
    for (const row of team) {
      const o = asJsonRecord(row);
      const role = String(o.role ?? o.type ?? "").toLowerCase();
      const name = toLabel(o.display_name ?? o.name ?? o.realname ?? o.user_name);
      if (role.includes("group") || role.includes("grupo")) {
        pushUnique(groups, name);
      } else if (role.includes("assign") || role.includes("tech") || role.includes("tecnico")) {
        pushUnique(assignees, name);
      }
    }
  }
  const usersIdTech = raw.users_id_tech;
  if (usersIdTech !== undefined && usersIdTech !== null) {
    const id = toPositiveInt(usersIdTech);
    if (id) pushUnique(assignees, `Utilizador #${id}`);
  }

  return {
    groups,
    assignees,
    category: toLabel(raw.itilcategories_id_name ?? raw.category_name ?? raw.category),
    entity: toLabel(raw.entities_id_name ?? raw.entity_name ?? raw.entity)
  };
}

export const STATUS_OPTIONS: Array<{ id: number; label: string }> = [
  { id: 1, label: "Novo" },
  { id: 2, label: "Em atendimento (atribuído)" },
  { id: 3, label: "Em atendimento (planejado)" },
  { id: 4, label: "Pendente" },
  { id: 5, label: "Solucionado" },
  { id: 6, label: "Fechado" }
];

export const PRIORITY_OPTIONS: Array<{ id: number; label: string }> = [
  { id: 1, label: "Muito baixa" },
  { id: 2, label: "Baixa" },
  { id: 3, label: "Média" },
  { id: 4, label: "Alta" },
  { id: 5, label: "Muito alta" },
  { id: 6, label: "Crítica / major" }
];
