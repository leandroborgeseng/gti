/**
 * Resolução de responsáveis efetivos de funcionalidades (tickets 54–55).
 * Regra atual: membros do grupo de validação + responsáveis específicos (complementam).
 * Fiscais do módulo são apenas acompanhamento e NÃO entram nos efetivos.
 */

export type ResponsibilitySourceKind = "GROUP" | "FEATURE";

export type LinkedUserLike = {
  id: string;
  name: string;
  email: string;
  organizationAcronym?: string | null;
  active?: boolean;
  role?: string;
};

export type EffectiveResponsible = LinkedUserLike & {
  sources: ResponsibilitySourceKind[];
};

export type FeatureResponsibilityView = {
  validationGroupId: string | null;
  validationGroup: { id: string; name: string; active: boolean } | null;
  groupUndefined: boolean;
  groupMemberUsers: LinkedUserLike[];
  responsibleUsers: LinkedUserLike[];
  responsibleUserIds: string[];
  effectiveResponsibles: EffectiveResponsible[];
  /** Motivos da atribuição para UI (grupo / específico). */
  assignmentReasons: Array<"GROUP" | "FEATURE" | "NONE" | "UNDEFINED_GROUP">;
};

function mergeUsers(
  groupUsers: LinkedUserLike[],
  featureUsers: LinkedUserLike[]
): EffectiveResponsible[] {
  const byId = new Map<string, EffectiveResponsible>();
  for (const u of groupUsers) {
    byId.set(u.id, { ...u, sources: ["GROUP"] });
  }
  for (const u of featureUsers) {
    const prev = byId.get(u.id);
    if (prev) {
      if (!prev.sources.includes("FEATURE")) prev.sources.push("FEATURE");
    } else {
      byId.set(u.id, { ...u, sources: ["FEATURE"] });
    }
  }
  return Array.from(byId.values());
}

export function resolveFeatureResponsibility(input: {
  validationGroupId: string | null | undefined;
  validationGroup?: { id: string; name: string; active: boolean; members?: LinkedUserLike[] } | null;
  responsibleUsers: LinkedUserLike[];
}): FeatureResponsibilityView {
  const groupUndefined = !input.validationGroupId;
  const group = input.validationGroup
    ? { id: input.validationGroup.id, name: input.validationGroup.name, active: input.validationGroup.active }
    : null;
  const groupMemberUsers = input.validationGroup?.members ?? [];
  const responsibleUsers = input.responsibleUsers;
  const effectiveResponsibles = mergeUsers(groupMemberUsers, responsibleUsers);
  const assignmentReasons: FeatureResponsibilityView["assignmentReasons"] = [];
  if (groupUndefined) assignmentReasons.push("UNDEFINED_GROUP");
  if (groupMemberUsers.length > 0) assignmentReasons.push("GROUP");
  if (responsibleUsers.length > 0) assignmentReasons.push("FEATURE");
  if (assignmentReasons.length === 0 || (assignmentReasons.length === 1 && assignmentReasons[0] === "UNDEFINED_GROUP" && effectiveResponsibles.length === 0)) {
    if (!assignmentReasons.includes("NONE") && effectiveResponsibles.length === 0) {
      assignmentReasons.push("NONE");
    }
  }
  return {
    validationGroupId: input.validationGroupId ?? null,
    validationGroup: group,
    groupUndefined,
    groupMemberUsers,
    responsibleUsers,
    responsibleUserIds: responsibleUsers.map((u) => u.id),
    effectiveResponsibles,
    assignmentReasons
  };
}

/** Filtros de atribuição da tela Funcionalidades (ticket 56). */
export type AssignmentFilter =
  | "ALL"
  | "ASSIGNED_TO_ME"
  | "GROUP_MEMBER"
  | "MODULE_FISCAL"
  | "NO_RESPONSIBLE";

export function parseAssignmentFilter(raw: string | undefined | null): AssignmentFilter {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "ASSIGNED_TO_ME" || v === "MINE") return "ASSIGNED_TO_ME";
  if (v === "GROUP_MEMBER" || v === "GROUP") return "GROUP_MEMBER";
  if (v === "MODULE_FISCAL" || v === "MODULE") return "MODULE_FISCAL";
  if (v === "NO_RESPONSIBLE" || v === "NONE") return "NO_RESPONSIBLE";
  return "ALL";
}
