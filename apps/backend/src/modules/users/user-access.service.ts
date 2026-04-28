import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";

type AccessEventType = "LOGIN" | "PAGE_VIEW" | "HEARTBEAT";

type AccessReportParams = {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
};

type AccessActor = {
  userId: string;
  email: string;
  role: UserRole;
};

type RecordAccessEventInput = {
  actor: AccessActor;
  eventType: AccessEventType;
  path?: string | null;
  pathLabel?: string | null;
  sessionId?: string | null;
  durationSeconds?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
};

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

function parseDate(raw: string | null | undefined, fallback: Date): Date {
  if (!raw) return fallback;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function resolvePeriod(params: AccessReportParams): { preset: string; from: Date; to: Date } {
  const now = new Date();
  const preset = params.preset?.trim() || "week";

  if (params.from || params.to) {
    return {
      preset: "custom",
      from: startOfDay(parseDate(params.from, new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000))),
      to: endOfDay(parseDate(params.to, now))
    };
  }

  if (preset === "today") {
    return { preset, from: startOfDay(now), to: endOfDay(now) };
  }
  if (preset === "month") {
    return { preset, from: startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)), to: endOfDay(now) };
  }
  return { preset: "week", from: startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)), to: endOfDay(now) };
}

function normalizeDurationSeconds(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 0;
  return Math.max(0, Math.min(300, Math.round(value ?? 0)));
}

export class UserAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAccessEventInput): Promise<void> {
    const durationSeconds = normalizeDurationSeconds(input.durationSeconds);
    await this.prisma.userAccessEvent.create({
      data: {
        userId: input.actor.userId,
        userEmail: input.actor.email,
        eventType: input.eventType,
        path: input.path?.slice(0, 300) || null,
        pathLabel: input.pathLabel?.slice(0, 160) || null,
        sessionId: input.sessionId?.slice(0, 120) || null,
        durationSeconds,
        ipAddress: input.ipAddress?.slice(0, 80) || null,
        userAgent: input.userAgent?.slice(0, 500) || null,
        metadata: input.metadata == null ? undefined : (input.metadata as object)
      }
    });
  }

  async report(params: AccessReportParams, actor: AccessActor): Promise<unknown> {
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Somente administradores podem consultar o relatório de uso por usuário.");
    }

    const period = resolvePeriod(params);
    const events = await this.prisma.userAccessEvent.findMany({
      where: { occurredAt: { gte: period.from, lte: period.to } },
      orderBy: { occurredAt: "desc" },
      take: 10000
    });

    const users = await this.prisma.user.findMany({
      select: { id: true, email: true, role: true, approvalStatus: true }
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const byUser = new Map<
      string,
      {
        userId: string | null;
        userEmail: string;
        role: UserRole | null;
        approvalStatus: string | null;
        loginCount: number;
        pageViewCount: number;
        totalActiveSeconds: number;
        firstSeenAt: Date | null;
        lastSeenAt: Date | null;
        paths: Map<string, { path: string; pathLabel: string; count: number; activeSeconds: number }>;
        recentEvents: Array<{ eventType: string; path: string | null; pathLabel: string | null; occurredAt: Date; durationSeconds: number }>;
      }
    >();

    for (const event of events) {
      const key = event.userId ?? event.userEmail;
      const user = event.userId ? userById.get(event.userId) : undefined;
      const entry =
        byUser.get(key) ??
        {
          userId: event.userId,
          userEmail: event.userEmail,
          role: user?.role ?? null,
          approvalStatus: user?.approvalStatus ?? null,
          loginCount: 0,
          pageViewCount: 0,
          totalActiveSeconds: 0,
          firstSeenAt: null,
          lastSeenAt: null,
          paths: new Map<string, { path: string; pathLabel: string; count: number; activeSeconds: number }>(),
          recentEvents: []
        };

      if (event.eventType === "LOGIN") entry.loginCount += 1;
      if (event.eventType === "PAGE_VIEW") entry.pageViewCount += 1;
      entry.totalActiveSeconds += event.durationSeconds;
      entry.firstSeenAt = entry.firstSeenAt == null || event.occurredAt < entry.firstSeenAt ? event.occurredAt : entry.firstSeenAt;
      entry.lastSeenAt = entry.lastSeenAt == null || event.occurredAt > entry.lastSeenAt ? event.occurredAt : entry.lastSeenAt;

      if (event.path) {
        const pathEntry =
          entry.paths.get(event.path) ??
          { path: event.path, pathLabel: event.pathLabel ?? event.path, count: 0, activeSeconds: 0 };
        if (event.eventType === "PAGE_VIEW") pathEntry.count += 1;
        pathEntry.activeSeconds += event.durationSeconds;
        entry.paths.set(event.path, pathEntry);
      }

      if (entry.recentEvents.length < 10) {
        entry.recentEvents.push({
          eventType: event.eventType,
          path: event.path,
          pathLabel: event.pathLabel,
          occurredAt: event.occurredAt,
          durationSeconds: event.durationSeconds
        });
      }

      byUser.set(key, entry);
    }

    return {
      period: { preset: period.preset, from: period.from.toISOString(), to: period.to.toISOString() },
      users: Array.from(byUser.values())
        .map((entry) => ({
          userId: entry.userId,
          userEmail: entry.userEmail,
          role: entry.role,
          approvalStatus: entry.approvalStatus,
          loginCount: entry.loginCount,
          pageViewCount: entry.pageViewCount,
          totalActiveSeconds: entry.totalActiveSeconds,
          firstSeenAt: entry.firstSeenAt?.toISOString() ?? null,
          lastSeenAt: entry.lastSeenAt?.toISOString() ?? null,
          topPaths: Array.from(entry.paths.values())
            .sort((a, b) => b.activeSeconds - a.activeSeconds || b.count - a.count)
            .slice(0, 8),
          recentEvents: entry.recentEvents.map((event) => ({
            ...event,
            occurredAt: event.occurredAt.toISOString()
          }))
        }))
        .sort((a, b) => b.totalActiveSeconds - a.totalActiveSeconds || b.loginCount - a.loginCount)
    };
  }
}
