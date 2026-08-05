import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { getAuditActorId } from "../../common/audit-actor";
import { PrismaService } from "../../prisma/prisma.service";
import {
  DEFAULT_AUDIT_EVENT_CATALOG,
  type AuditDetailLevel,
  type AuditEventCatalogItem
} from "./audit-event-catalog";

export type AuditLogSource = "AUDIT" | "ACCESS";

export type AuditLogListParams = {
  page?: number;
  limit?: number;
  from?: string | null;
  to?: string | null;
  actor?: string | null;
  action?: string | null;
  entity?: string | null;
  q?: string | null;
  /** ALL (padrão), AUDIT ou ACCESS */
  source?: string | null;
};

export type AuditLogListItem = {
  id: string;
  source: AuditLogSource;
  occurredAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorId: string | null;
  actorLabel: string;
  description: string;
  hasDiff: boolean;
  originHref: string | null;
  oldData?: unknown;
  newData?: unknown;
  metadata?: unknown;
};

function csvCell(value: string): string {
  const v = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

function parseOptionalDate(raw: string | null | undefined, end: boolean): Date | undefined {
  if (!raw?.trim()) return undefined;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return undefined;
  return end ? endOfDay(d) : startOfDay(d);
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value as number)));
}

function actorDisplay(user: {
  email: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
} | null | undefined, fallbackId: string | null): string {
  if (!user) {
    if (!fallbackId) return "-";
    if (fallbackId === "system") return "Sistema";
    return fallbackId;
  }
  const name =
    user.displayName?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name ? `${name} (${user.email})` : user.email;
}

function auditDescription(action: string, entity: string, entityId: string): string {
  const shortId = entityId.length > 12 ? `${entityId.slice(0, 8)}…` : entityId;
  return `${action} em ${entity} (${shortId})`;
}

function accessDescription(eventType: string, pathLabel: string | null, path: string | null): string {
  const label = eventType === "LOGIN" ? "Login" : eventType === "LOGOUT" ? "Logout" : eventType;
  const where = pathLabel?.trim() || path?.trim();
  return where ? `${label} · ${where}` : label;
}

function normalizeSource(raw: string | null | undefined): "ALL" | AuditLogSource {
  const v = (raw ?? "ALL").trim().toUpperCase();
  if (v === "AUDIT" || v === "ACCESS") return v;
  return "ALL";
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: AuditLogListParams): Promise<{
    items: AuditLogListItem[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }> {
    const page = clampInt(params.page, 1, 10_000, 1);
    const limit = clampInt(params.limit, 1, 100, 25);
    const { items, total } = await this.queryMerged(params, {
      offset: (page - 1) * limit,
      limit,
      includeDiff: false
    });
    return {
      items,
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    };
  }

  async findOne(id: string, sourceRaw?: string | null): Promise<AuditLogListItem> {
    const source = normalizeSource(sourceRaw);
    if (source === "ACCESS" || source === "ALL") {
      const event = await this.prisma.userAccessEvent.findUnique({ where: { id } });
      if (event && (event.eventType === "LOGIN" || event.eventType === "LOGOUT")) {
        const user = event.userId
          ? await this.prisma.user.findUnique({
              where: { id: event.userId },
              select: { email: true, displayName: true, firstName: true, lastName: true }
            })
          : null;
        return {
          id: event.id,
          source: "ACCESS",
          occurredAt: event.occurredAt.toISOString(),
          action: event.eventType,
          entity: "Auth",
          entityId: event.userId,
          actorId: event.userId,
          actorLabel: actorDisplay(user, event.userEmail),
          description: accessDescription(event.eventType, event.pathLabel, event.path),
          hasDiff: false,
          originHref: null,
          metadata: {
            path: event.path,
            pathLabel: event.pathLabel,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent,
            sessionId: event.sessionId,
            ...(event.metadata && typeof event.metadata === "object" ? (event.metadata as object) : {})
          }
        };
      }
      if (source === "ACCESS") throw new NotFoundException("Evento de acesso não encontrado");
    }

    const row = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Registro de auditoria não encontrado");
    const user =
      row.userId && row.userId !== "system"
        ? await this.prisma.user.findUnique({
            where: { id: row.userId },
            select: { email: true, displayName: true, firstName: true, lastName: true }
          })
        : null;
    const originHref = await this.resolveContractHref(row.entity, row.entityId);
    return {
      id: row.id,
      source: "AUDIT",
      occurredAt: row.timestamp.toISOString(),
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      actorId: row.userId,
      actorLabel: actorDisplay(user, row.userId),
      description: auditDescription(row.action, row.entity, row.entityId),
      hasDiff: row.oldData != null || row.newData != null,
      originHref,
      oldData: row.oldData,
      newData: row.newData
    };
  }

  async exportCsv(params: AuditLogListParams): Promise<string> {
    const { items } = await this.queryMerged(params, {
      offset: 0,
      limit: 10_000,
      includeDiff: false
    });
    const header = ["data_hora", "tipo", "acao", "entidade", "id_entidade", "ator", "descricao", "origem"].join(",");
    const lines = items.map((item) =>
      [
        csvCell(item.occurredAt),
        csvCell(item.source === "AUDIT" ? "Auditoria" : "Acesso"),
        csvCell(item.action),
        csvCell(item.entity),
        csvCell(item.entityId ?? ""),
        csvCell(item.actorLabel),
        csvCell(item.description),
        csvCell(item.originHref ?? "")
      ].join(",")
    );
    return [header, ...lines].join("\n");
  }

  private async queryMerged(
    params: AuditLogListParams,
    opts: { offset: number; limit: number; includeDiff: boolean }
  ): Promise<{ items: AuditLogListItem[]; total: number }> {
    const source = normalizeSource(params.source);
    const from = parseOptionalDate(params.from, false);
    const to = parseOptionalDate(params.to, true);
    const action = params.action?.trim() || "";
    const entity = params.entity?.trim() || "";
    const q = params.q?.trim() || "";
    const actor = params.actor?.trim() || "";

    const actorUserIds = actor ? await this.resolveActorUserIds(actor) : null;

    const includeAudit = source === "ALL" || source === "AUDIT";
    const includeAccess = source === "ALL" || source === "ACCESS";

    // Eventos de acesso usam entidade lógica "Auth"; filtro por outra entidade exclui ACCESS.
    const entityLower = entity.toLowerCase();
    const accessEntityMatch =
      !entity || entityLower === "auth" || entityLower === "useraccess" || entityLower === "session";
    const auditEntityMatch = !entity || (entityLower !== "auth" && entityLower !== "useraccess" && entityLower !== "session");

    const fetchSize = opts.offset + opts.limit;

    const [auditRows, accessRows, auditCount, accessCount] = await Promise.all([
      includeAudit && auditEntityMatch
        ? this.prisma.auditLog.findMany({
            where: this.buildAuditWhere({ from, to, action, entity, q, actor, actorUserIds }),
            orderBy: { timestamp: "desc" },
            take: fetchSize
          })
        : Promise.resolve([]),
      includeAccess && accessEntityMatch
        ? this.prisma.userAccessEvent.findMany({
            where: this.buildAccessWhere({ from, to, action, q, actor, actorUserIds }),
            orderBy: { occurredAt: "desc" },
            take: fetchSize
          })
        : Promise.resolve([]),
      includeAudit && auditEntityMatch
        ? this.prisma.auditLog.count({
            where: this.buildAuditWhere({ from, to, action, entity, q, actor, actorUserIds })
          })
        : Promise.resolve(0),
      includeAccess && accessEntityMatch
        ? this.prisma.userAccessEvent.count({
            where: this.buildAccessWhere({ from, to, action, q, actor, actorUserIds })
          })
        : Promise.resolve(0)
    ]);

    const userIds = new Set<string>();
    for (const row of auditRows) {
      if (row.userId && row.userId !== "system") userIds.add(row.userId);
    }
    for (const row of accessRows) {
      if (row.userId) userIds.add(row.userId);
    }
    const users =
      userIds.size > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: [...userIds] } },
            select: { id: true, email: true, displayName: true, firstName: true, lastName: true }
          })
        : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const contractIds = auditRows.filter((r) => r.entity === "Contract").map((r) => r.entityId);
    const existingContracts =
      contractIds.length > 0
        ? await this.prisma.contract.findMany({
            where: { id: { in: [...new Set(contractIds)] }, deletedAt: null },
            select: { id: true }
          })
        : [];
    const contractExists = new Set(existingContracts.map((c) => c.id));

    const mapped: AuditLogListItem[] = [
      ...auditRows.map((row): AuditLogListItem => {
        const user = userById.get(row.userId);
        return {
          id: row.id,
          source: "AUDIT",
          occurredAt: row.timestamp.toISOString(),
          action: row.action,
          entity: row.entity,
          entityId: row.entityId,
          actorId: row.userId,
          actorLabel: actorDisplay(user, row.userId),
          description: auditDescription(row.action, row.entity, row.entityId),
          hasDiff: row.oldData != null || row.newData != null,
          originHref: row.entity === "Contract" && contractExists.has(row.entityId) ? `/contracts/${row.entityId}` : null,
          ...(opts.includeDiff ? { oldData: row.oldData, newData: row.newData } : {})
        };
      }),
      ...accessRows.map((row): AuditLogListItem => {
        const user = row.userId ? userById.get(row.userId) : undefined;
        return {
          id: row.id,
          source: "ACCESS",
          occurredAt: row.occurredAt.toISOString(),
          action: row.eventType,
          entity: "Auth",
          entityId: row.userId,
          actorId: row.userId,
          actorLabel: actorDisplay(user ?? null, row.userEmail),
          description: accessDescription(row.eventType, row.pathLabel, row.path),
          hasDiff: false,
          originHref: null
        };
      })
    ];

    mapped.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
    const items = mapped.slice(opts.offset, opts.offset + opts.limit);
    return { items, total: auditCount + accessCount };
  }

  private buildAuditWhere(input: {
    from?: Date;
    to?: Date;
    action: string;
    entity: string;
    q: string;
    actor: string;
    actorUserIds: string[] | null;
  }): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (input.from || input.to) {
      where.timestamp = {
        ...(input.from ? { gte: input.from } : {}),
        ...(input.to ? { lte: input.to } : {})
      };
    }
    if (input.action) {
      where.action = { contains: input.action, mode: "insensitive" };
    }
    if (input.entity) {
      where.entity = { contains: input.entity, mode: "insensitive" };
    }
    if (input.actorUserIds) {
      if (input.actorUserIds.length === 0 && input.actor.toLowerCase() !== "system") {
        where.userId = "__none__";
      } else if (input.actor.toLowerCase() === "system") {
        where.userId = "system";
      } else {
        where.userId = { in: input.actorUserIds };
      }
    } else if (input.actor) {
      // UUID direto ou "system"
      where.userId = { contains: input.actor, mode: "insensitive" };
    }
    if (input.q) {
      where.OR = [
        { action: { contains: input.q, mode: "insensitive" } },
        { entity: { contains: input.q, mode: "insensitive" } },
        { entityId: { contains: input.q, mode: "insensitive" } },
        { userId: { contains: input.q, mode: "insensitive" } }
      ];
    }
    return where;
  }

  private buildAccessWhere(input: {
    from?: Date;
    to?: Date;
    action: string;
    q: string;
    actor: string;
    actorUserIds: string[] | null;
  }): Prisma.UserAccessEventWhereInput {
    const where: Prisma.UserAccessEventWhereInput = {
      eventType: { in: ["LOGIN", "LOGOUT"] }
    };
    if (input.from || input.to) {
      where.occurredAt = {
        ...(input.from ? { gte: input.from } : {}),
        ...(input.to ? { lte: input.to } : {})
      };
    }
    if (input.action) {
      const actionUpper = input.action.toUpperCase();
      if (actionUpper === "LOGIN" || actionUpper === "LOGOUT") {
        where.eventType = actionUpper;
      } else {
        // Filtro de ação de auditoria não se aplica a eventos de acesso.
        where.id = "__none__";
      }
    }
    if (input.actorUserIds) {
      if (input.actorUserIds.length === 0) {
        where.OR = [{ userEmail: { contains: input.actor, mode: "insensitive" } }];
      } else {
        where.OR = [
          { userId: { in: input.actorUserIds } },
          { userEmail: { contains: input.actor, mode: "insensitive" } }
        ];
      }
    } else if (input.actor) {
      where.OR = [
        { userId: { contains: input.actor, mode: "insensitive" } },
        { userEmail: { contains: input.actor, mode: "insensitive" } }
      ];
    }
    if (input.q) {
      const textOr: Prisma.UserAccessEventWhereInput[] = [
        { eventType: { contains: input.q, mode: "insensitive" } },
        { path: { contains: input.q, mode: "insensitive" } },
        { pathLabel: { contains: input.q, mode: "insensitive" } },
        { userEmail: { contains: input.q, mode: "insensitive" } }
      ];
      where.AND = [...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []), { OR: textOr }];
    }
    return where;
  }

  private async resolveActorUserIds(actor: string): Promise<string[]> {
    const term = actor.trim();
    if (!term) return [];
    if (term.toLowerCase() === "system") return ["system"];
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { id: term },
          { email: { contains: term, mode: "insensitive" } },
          { displayName: { contains: term, mode: "insensitive" } },
          { firstName: { contains: term, mode: "insensitive" } },
          { lastName: { contains: term, mode: "insensitive" } }
        ]
      },
      select: { id: true },
      take: 200
    });
    return users.map((u) => u.id);
  }

  private async resolveContractHref(entity: string, entityId: string): Promise<string | null> {
    if (entity !== "Contract") return null;
    const found = await this.prisma.contract.findFirst({
      where: { id: entityId, deletedAt: null },
      select: { id: true }
    });
    return found ? `/contracts/${found.id}` : null;
  }

  async listEventConfig(): Promise<{
    modules: Array<{
      moduleKey: string;
      moduleLabel: string;
      events: Array<{
        id: string;
        moduleKey: string;
        screenKey: string;
        actionKey: string;
        label: string;
        enabled: boolean;
        detailLevel: AuditDetailLevel;
        mandatory: boolean;
        sortOrder: number;
      }>;
    }>;
    total: number;
    enabledCount: number;
  }> {
    await this.ensureCatalogSeeded();
    const rows = await this.prisma.auditEventConfig.findMany({
      orderBy: [{ moduleKey: "asc" }, { sortOrder: "asc" }, { actionKey: "asc" }]
    });
    const byModule = new Map<
      string,
      {
        moduleKey: string;
        moduleLabel: string;
        events: Array<{
          id: string;
          moduleKey: string;
          screenKey: string;
          actionKey: string;
          label: string;
          enabled: boolean;
          detailLevel: AuditDetailLevel;
          mandatory: boolean;
          sortOrder: number;
        }>;
      }
    >();
    for (const row of rows) {
      const detailLevel: AuditDetailLevel =
        row.detailLevel === "ACTION_ONLY" ? "ACTION_ONLY" : "ACTION_AND_VALUES";
      const event = {
        id: row.id,
        moduleKey: row.moduleKey,
        screenKey: row.screenKey,
        actionKey: row.actionKey,
        label: row.label,
        enabled: row.mandatory ? true : row.enabled,
        detailLevel,
        mandatory: row.mandatory,
        sortOrder: row.sortOrder
      };
      const existing = byModule.get(row.moduleKey);
      if (existing) {
        existing.events.push(event);
      } else {
        byModule.set(row.moduleKey, {
          moduleKey: row.moduleKey,
          moduleLabel: row.moduleLabel || row.moduleKey,
          events: [event]
        });
      }
    }
    const modules = [...byModule.values()];
    const enabledCount = rows.filter((r) => r.mandatory || r.enabled).length;
    return { modules, total: rows.length, enabledCount };
  }

  async saveEventConfig(input: {
    items: Array<{ id: string; enabled: boolean; detailLevel?: string }>;
  }): Promise<{ ok: true; summary: { total: number; enabled: number; disabled: number; changed: number } }> {
    await this.ensureCatalogSeeded();
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new BadRequestException("Informe ao menos um evento para salvar.");
    }

    const ids = input.items.map((i) => i.id);
    const existing = await this.prisma.auditEventConfig.findMany({
      where: { id: { in: ids } }
    });
    const byId = new Map(existing.map((r) => [r.id, r]));
    const updates: Array<{ id: string; enabled: boolean; detailLevel: AuditDetailLevel }> = [];
    const beforeSnapshot: Array<Record<string, unknown>> = [];
    const afterSnapshot: Array<Record<string, unknown>> = [];

    for (const item of input.items) {
      const row = byId.get(item.id);
      if (!row) continue;
      const detailLevel: AuditDetailLevel =
        item.detailLevel === "ACTION_ONLY" ? "ACTION_ONLY" : "ACTION_AND_VALUES";
      const enabled = row.mandatory ? true : Boolean(item.enabled);
      if (row.enabled === enabled && row.detailLevel === detailLevel) continue;
      beforeSnapshot.push({
        id: row.id,
        moduleKey: row.moduleKey,
        screenKey: row.screenKey,
        actionKey: row.actionKey,
        enabled: row.enabled,
        detailLevel: row.detailLevel
      });
      afterSnapshot.push({
        id: row.id,
        moduleKey: row.moduleKey,
        screenKey: row.screenKey,
        actionKey: row.actionKey,
        enabled,
        detailLevel
      });
      updates.push({ id: row.id, enabled, detailLevel });
    }

    if (updates.length > 0) {
      await this.prisma.$transaction(
        updates.map((u) =>
          this.prisma.auditEventConfig.update({
            where: { id: u.id },
            data: { enabled: u.enabled, detailLevel: u.detailLevel }
          })
        )
      );
    }

    // Auditoria da própria alteração de configuração (obrigatória).
    await this.prisma.auditLog.create({
      data: {
        entity: "AuditEventConfig",
        entityId: "catalog",
        action: "UPDATE",
        userId: getAuditActorId(),
        oldData: { changed: beforeSnapshot } as Prisma.InputJsonValue,
        newData: {
          changed: afterSnapshot,
          summary: {
            total: existing.length,
            changed: updates.length
          }
        } as Prisma.InputJsonValue
      }
    });

    const all = await this.prisma.auditEventConfig.findMany({ select: { enabled: true, mandatory: true } });
    const enabled = all.filter((r) => r.mandatory || r.enabled).length;
    return {
      ok: true,
      summary: {
        total: all.length,
        enabled,
        disabled: all.length - enabled,
        changed: updates.length
      }
    };
  }

  async restoreEventConfigDefaults(): Promise<{
    ok: true;
    summary: { total: number; enabled: number; disabled: number; restored: number };
  }> {
    await this.ensureCatalogSeeded();
    const before = await this.prisma.auditEventConfig.findMany();
    const catalogByKey = new Map(
      DEFAULT_AUDIT_EVENT_CATALOG.map((c) => [`${c.moduleKey}|${c.screenKey}|${c.actionKey}`, c])
    );

    let restored = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const row of before) {
        const key = `${row.moduleKey}|${row.screenKey}|${row.actionKey}`;
        const def = catalogByKey.get(key);
        if (!def) continue;
        if (
          row.enabled === def.enabled &&
          row.detailLevel === def.detailLevel &&
          row.mandatory === def.mandatory &&
          row.label === def.label
        ) {
          continue;
        }
        await tx.auditEventConfig.update({
          where: { id: row.id },
          data: {
            enabled: def.enabled,
            detailLevel: def.detailLevel,
            mandatory: def.mandatory,
            label: def.label,
            moduleLabel: def.moduleLabel,
            sortOrder: def.sortOrder
          }
        });
        restored += 1;
      }
      // Inclui eventos novos do catálogo que ainda não existirem.
      for (const def of DEFAULT_AUDIT_EVENT_CATALOG) {
        await tx.auditEventConfig.upsert({
          where: {
            moduleKey_screenKey_actionKey: {
              moduleKey: def.moduleKey,
              screenKey: def.screenKey,
              actionKey: def.actionKey
            }
          },
          create: catalogItemToCreate(def),
          update: {}
        });
      }
    });

    await this.prisma.auditLog.create({
      data: {
        entity: "AuditEventConfig",
        entityId: "catalog",
        action: "UPDATE",
        userId: getAuditActorId(),
        oldData: { action: "RESTORE_DEFAULTS", count: before.length } as Prisma.InputJsonValue,
        newData: { action: "RESTORE_DEFAULTS", restored } as Prisma.InputJsonValue
      }
    });

    const all = await this.prisma.auditEventConfig.findMany({ select: { enabled: true, mandatory: true } });
    const enabled = all.filter((r) => r.mandatory || r.enabled).length;
    return {
      ok: true,
      summary: {
        total: all.length,
        enabled,
        disabled: all.length - enabled,
        restored
      }
    };
  }

  private async ensureCatalogSeeded(): Promise<void> {
    const count = await this.prisma.auditEventConfig.count();
    if (count > 0) return;
    await this.prisma.auditEventConfig.createMany({
      data: DEFAULT_AUDIT_EVENT_CATALOG.map(catalogItemToCreate),
      skipDuplicates: true
    });
  }
}

function catalogItemToCreate(def: AuditEventCatalogItem): Prisma.AuditEventConfigCreateManyInput {
  return {
    moduleKey: def.moduleKey,
    screenKey: def.screenKey,
    actionKey: def.actionKey,
    label: def.label,
    moduleLabel: def.moduleLabel,
    enabled: def.enabled,
    detailLevel: def.detailLevel,
    mandatory: def.mandatory,
    sortOrder: def.sortOrder
  };
}
