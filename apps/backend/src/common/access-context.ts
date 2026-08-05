import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { PrismaClient, UserRole } from "@prisma/client";
import type { RequestActor } from "./audit-actor";

export type AccessProfileSummary = {
  id: string;
  name: string;
  systemKey: string | null;
};

export type AccessOrganizationSummary = {
  id: string;
  name: string;
  acronym: string;
};

export type ActiveAccessContext = {
  profileId: string;
  profileName: string;
  systemKey: string | null;
  /** Compat: systemKey ou role legado. */
  role: UserRole;
  organizationId: string | null;
  organizationLabel: string;
  allOrganizationsActive: boolean;
};

export type AuthMeAccessPayload = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  profileColor: string | null;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  role: UserRole;
  mustChangePassword: boolean;
  allOrganizations: boolean;
  profiles: AccessProfileSummary[];
  organizations: AccessOrganizationSummary[];
  activeContext: ActiveAccessContext;
};

type UserAccessRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  profileColor: string | null;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  role: UserRole;
  mustChangePassword: boolean;
  organizationId: string | null;
  allOrganizations: boolean;
  lastActiveProfileId: string | null;
  lastActiveOrganizationId: string | null;
  defaultProfileId: string | null;
  defaultOrganizationId: string | null;
  accessProfiles: Array<{
    isDefault: boolean;
    profile: { id: string; name: string; systemKey: string | null; active: boolean };
  }>;
  organizations: Array<{
    isDefault: boolean;
    organization: { id: string; name: string; acronym: string; active: boolean };
  }>;
};

const USER_ACCESS_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  displayName: true,
  profileColor: true,
  jobTitle: true,
  department: true,
  phone: true,
  role: true,
  mustChangePassword: true,
  organizationId: true,
  allOrganizations: true,
  lastActiveProfileId: true,
  lastActiveOrganizationId: true,
  defaultProfileId: true,
  defaultOrganizationId: true,
  accessProfiles: {
    select: {
      isDefault: true,
      profile: { select: { id: true, name: true, systemKey: true, active: true } }
    }
  },
  organizations: {
    select: {
      isDefault: true,
      organization: { select: { id: true, name: true, acronym: true, active: true } }
    }
  }
} as const;

function systemKeyToRole(systemKey: string | null | undefined, fallback: UserRole): UserRole {
  if (systemKey === "ADMIN" || systemKey === "EDITOR" || systemKey === "VIEWER") {
    return systemKey;
  }
  return fallback;
}

function pickProfile(user: UserAccessRow): UserAccessRow["accessProfiles"][number]["profile"] {
  const linked = user.accessProfiles.filter((l) => l.profile.active);
  if (linked.length === 0) {
    throw new ForbiddenException(
      "Seu vínculo de perfil foi alterado. Faça login novamente ou peça à administração para revisar o cadastro."
    );
  }
  const byLast = linked.find((l) => l.profile.id === user.lastActiveProfileId);
  if (byLast) return byLast.profile;
  const byDefault = linked.find((l) => l.profile.id === user.defaultProfileId || l.isDefault);
  if (byDefault) return byDefault.profile;
  return linked[0]!.profile;
}

function resolveOrganization(
  user: UserAccessRow,
  preferredId: string | null | undefined
): { organizationId: string | null; organizationLabel: string; allOrganizationsActive: boolean } {
  const linked = user.organizations.filter((l) => l.organization.active);
  const wantsAll = preferredId == null || preferredId === "";

  if (wantsAll) {
    if (user.allOrganizations || linked.length === 0) {
      // Sem vínculos e sem flag: legado aberto (visão global) até a administração corrigir o cadastro.
      return { organizationId: null, organizationLabel: "Todos os órgãos", allOrganizationsActive: true };
    }
    // Sem allOrganizations: cair no padrão / primeiro vínculo
    const byDefault = linked.find((l) => l.organization.id === user.defaultOrganizationId || l.isDefault);
    const pick = byDefault ?? linked[0]!;
    return {
      organizationId: pick.organization.id,
      organizationLabel: pick.organization.acronym
        ? `${pick.organization.acronym} · ${pick.organization.name}`
        : pick.organization.name,
      allOrganizationsActive: false
    };
  }

  const match = linked.find((l) => l.organization.id === preferredId);
  if (match) {
    return {
      organizationId: match.organization.id,
      organizationLabel: match.organization.acronym
        ? `${match.organization.acronym} · ${match.organization.name}`
        : match.organization.name,
      allOrganizationsActive: false
    };
  }

  // allOrganizations permite órgão específico mesmo sem vínculo N:N explícito? Spec: organizationId específico mesmo com allOrganizations = visão restrita.
  // Mas precisa validar que o órgão existe se allOrganizations. Para usuários com allOrganizations sem vínculo, permitir qualquer órgão ativo via lookup externo.
  if (user.allOrganizations) {
    return {
      organizationId: preferredId,
      organizationLabel: preferredId,
      allOrganizationsActive: false
    };
  }

  throw new ForbiddenException(
    "O órgão selecionado não está mais vinculado à sua conta. Escolha outro contexto ou faça login novamente."
  );
}

export function buildActiveContext(user: UserAccessRow, opts?: { profileId?: string; organizationId?: string | null }): ActiveAccessContext {
  let profile = pickProfile(user);
  if (opts?.profileId) {
    const linked = user.accessProfiles.find((l) => l.profile.id === opts.profileId && l.profile.active);
    if (!linked) {
      throw new BadRequestException("Perfil inválido ou não vinculado ao usuário.");
    }
    profile = linked.profile;
  }

  const preferredOrg =
    opts && "organizationId" in opts
      ? opts.organizationId
      : user.lastActiveOrganizationId !== undefined
        ? user.lastActiveOrganizationId
        : user.defaultOrganizationId;

  let org = resolveOrganization(user, preferredOrg ?? null);

  // Se allOrganizations pediu org específica sem nome (só id), enriquecer depois no switch.
  if (org.organizationId && org.organizationLabel === org.organizationId) {
    // placeholder; caller may enrich
  }

  const role = systemKeyToRole(profile.systemKey, user.role);
  return {
    profileId: profile.id,
    profileName: profile.name,
    systemKey: profile.systemKey,
    role,
    organizationId: org.organizationId,
    organizationLabel: org.organizationLabel,
    allOrganizationsActive: org.allOrganizationsActive
  };
}

export function toRequestActor(
  user: { id: string; email: string },
  ctx: ActiveAccessContext
): RequestActor {
  return {
    userId: user.id,
    email: user.email,
    role: ctx.systemKey ?? ctx.role,
    profileId: ctx.profileId,
    organizationId: ctx.organizationId,
    allOrganizationsActive: ctx.allOrganizationsActive
  };
}

export function toAuthMePayload(user: UserAccessRow, ctx: ActiveAccessContext): AuthMeAccessPayload {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    profileColor: user.profileColor,
    jobTitle: user.jobTitle,
    department: user.department,
    phone: user.phone,
    role: ctx.role,
    mustChangePassword: user.mustChangePassword,
    allOrganizations: user.allOrganizations,
    profiles: user.accessProfiles
      .filter((l) => l.profile.active)
      .map((l) => ({ id: l.profile.id, name: l.profile.name, systemKey: l.profile.systemKey })),
    organizations: user.organizations
      .filter((l) => l.organization.active)
      .map((l) => ({
        id: l.organization.id,
        name: l.organization.name,
        acronym: l.organization.acronym
      })),
    activeContext: ctx
  };
}

export async function loadUserAccessContext(
  prisma: PrismaClient,
  userId: string
): Promise<UserAccessRow | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: USER_ACCESS_SELECT
  }) as Promise<UserAccessRow | null>;
}

export async function resolveAuthMeForUser(
  prisma: PrismaClient,
  userId: string
): Promise<AuthMeAccessPayload> {
  const user = await loadUserAccessContext(prisma, userId);
  if (!user) {
    throw new ForbiddenException("Usuário não encontrado.");
  }
  const ctx = buildActiveContext(user);
  // Enriquecer rótulo se allOrganizations + org específica sem vínculo
  if (ctx.organizationId && ctx.organizationLabel === ctx.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true, acronym: true, active: true }
    });
    if (!org || !org.active) {
      throw new ForbiddenException("O órgão ativo não está disponível. Escolha outro contexto.");
    }
    ctx.organizationLabel = org.acronym ? `${org.acronym} · ${org.name}` : org.name;
  }
  return toAuthMePayload(user, ctx);
}

export async function switchUserAccessContext(
  prisma: PrismaClient,
  userId: string,
  input: { profileId: string; organizationId?: string | null }
): Promise<AuthMeAccessPayload> {
  const user = await loadUserAccessContext(prisma, userId);
  if (!user) {
    throw new ForbiddenException("Usuário não encontrado.");
  }

  const linkedProfile = user.accessProfiles.find((l) => l.profile.id === input.profileId && l.profile.active);
  if (!linkedProfile) {
    throw new BadRequestException("Perfil inválido ou não vinculado ao usuário.");
  }

  const orgId = input.organizationId === undefined ? user.lastActiveOrganizationId : input.organizationId;
  if (orgId) {
    if (!user.allOrganizations) {
      const linkedOrg = user.organizations.find((l) => l.organization.id === orgId && l.organization.active);
      if (!linkedOrg) {
        throw new BadRequestException("Órgão inválido ou não vinculado ao usuário.");
      }
    } else {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true, active: true }
      });
      if (!org?.active) {
        throw new BadRequestException("Órgão inválido ou inativo.");
      }
    }
  } else if (!user.allOrganizations) {
    throw new BadRequestException(
      "Este usuário não possui abrangência «Todos os órgãos». Selecione um órgão vinculado."
    );
  }

  const ctx = buildActiveContext(user, { profileId: input.profileId, organizationId: orgId ?? null });
  if (ctx.organizationId && ctx.organizationLabel === ctx.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true, acronym: true }
    });
    if (org) {
      ctx.organizationLabel = org.acronym ? `${org.acronym} · ${org.name}` : org.name;
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      lastActiveProfileId: ctx.profileId,
      lastActiveOrganizationId: ctx.organizationId,
      // Compat: role legado = systemKey do perfil ativo quando existir
      ...(ctx.systemKey === "ADMIN" || ctx.systemKey === "EDITOR" || ctx.systemKey === "VIEWER"
        ? { role: ctx.systemKey }
        : {})
    }
  });

  await prisma.userAccessEvent.create({
    data: {
      userId,
      userEmail: user.email,
      eventType: "CONTEXT_SWITCH",
      path: "/auth/context",
      pathLabel: "Troca de contexto",
      metadata: {
        profileId: ctx.profileId,
        profileName: ctx.profileName,
        organizationId: ctx.organizationId,
        organizationLabel: ctx.organizationLabel,
        allOrganizationsActive: ctx.allOrganizationsActive
      }
    }
  });

  const refreshed = await loadUserAccessContext(prisma, userId);
  if (!refreshed) throw new ForbiddenException("Usuário não encontrado.");
  return toAuthMePayload(refreshed, ctx);
}

/** Aplica filtro de órgão do ator ativo (sem bypass automático por ADMIN). */
export function actorOrganizationFilter(actor: RequestActor | undefined): string | null | undefined {
  if (!actor) return undefined;
  if (actor.allOrganizationsActive || actor.organizationId == null || actor.organizationId === "") {
    return null; // sem filtro
  }
  return actor.organizationId;
}
