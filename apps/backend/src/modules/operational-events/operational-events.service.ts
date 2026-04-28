import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { getAuditActorId, getAuditActorLabel } from "../../common/audit-actor";
import { PrismaService } from "../../prisma/prisma.service";

export type OperationalEventCategory = "GLPI" | "PROJECTS" | "CONTRACTS" | "MEASUREMENTS" | "USERS" | "SYSTEM";

export type OperationalEventInput = {
  type: string;
  category: OperationalEventCategory;
  entity: string;
  entityId?: string | number | null;
  title: string;
  description?: string | null;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
};

type PeriodPreset = "today" | "yesterday" | "week" | "month";

type SummaryParams = {
  preset?: PeriodPreset;
  from?: string | null;
  to?: string | null;
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function parseDateBoundary(value: string | null | undefined, fallback: Date, endOfDay: boolean): Date {
  if (!value?.trim()) return fallback;
  const raw = value.trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
  if (Number.isNaN(d.getTime())) return fallback;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    d.setHours(23, 59, 59, 999);
  }
  return d;
}

function resolvePeriod(params: SummaryParams): { from: Date; to: Date; preset: PeriodPreset | "custom" } {
  const now = new Date();
  const today = startOfDay(now);
  if (params.from || params.to) {
    return {
      from: parseDateBoundary(params.from, today, false),
      to: parseDateBoundary(params.to, now, true),
      preset: "custom"
    };
  }
  const preset = params.preset ?? "today";
  if (preset === "yesterday") {
    const from = addDays(today, -1);
    return { from, to: new Date(today.getTime() - 1), preset };
  }
  if (preset === "week") {
    return { from: addDays(today, -6), to: now, preset };
  }
  if (preset === "month") {
    return { from: addDays(today, -29), to: now, preset };
  }
  return { from: today, to: now, preset: "today" };
}

function parseGlpiDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? raw.replace(" ", "T") : raw;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isClosedStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return (
    s.includes("fechado") ||
    s.includes("solucionado") ||
    s.includes("resolvido") ||
    s.includes("closed") ||
    s.includes("solved")
  );
}

function inRange(date: Date | null, from: Date, to: Date): boolean {
  return date != null && date >= from && date <= to;
}

function limitRows<T>(rows: T[], limit: number): T[] {
  return rows.slice(0, limit);
}

@Injectable()
export class OperationalEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: OperationalEventInput): Promise<void> {
    await this.prisma.operationalEvent.create({
      data: {
        type: input.type,
        category: input.category,
        entity: input.entity,
        entityId: input.entityId == null ? null : String(input.entityId),
        title: input.title,
        description: input.description ?? null,
        actorId: getAuditActorId(),
        actorLabel: getAuditActorLabel(),
        occurredAt: input.occurredAt ?? new Date(),
        metadata: input.metadata
      }
    });
  }

  async summary(params: SummaryParams): Promise<unknown> {
    const period = resolvePeriod(params);
    const [events, tickets] = await Promise.all([
      this.prisma.operationalEvent.findMany({
        where: { occurredAt: { gte: period.from, lte: period.to } },
        orderBy: { occurredAt: "desc" },
        take: 500
      }),
      this.prisma.ticket.findMany({
        select: {
          glpiTicketId: true,
          title: true,
          status: true,
          dateCreation: true,
          dateModification: true,
          assignedUserName: true,
          contractGroupName: true
        },
        orderBy: { id: "desc" },
        take: 10000
      })
    ]);

    const openedTickets = tickets
      .map((ticket) => ({ ticket, occurredAt: parseGlpiDate(ticket.dateCreation) }))
      .filter((row) => inRange(row.occurredAt, period.from, period.to))
      .sort((a, b) => (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0));

    const closedTickets = tickets
      .filter((ticket) => isClosedStatus(ticket.status))
      .map((ticket) => ({ ticket, occurredAt: parseGlpiDate(ticket.dateModification) }))
      .filter((row) => inRange(row.occurredAt, period.from, period.to))
      .sort((a, b) => (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0));

    const eventsByCategory = events.reduce<Record<string, number>>((acc, event) => {
      acc[event.category] = (acc[event.category] ?? 0) + 1;
      return acc;
    }, {});

    const eventRows = events.map((event) => ({
      id: event.id,
      type: event.type,
      category: event.category,
      entity: event.entity,
      entityId: event.entityId,
      title: event.title,
      description: event.description,
      actorLabel: event.actorLabel,
      occurredAt: event.occurredAt.toISOString(),
      metadata: event.metadata
    }));

    return {
      period: {
        preset: period.preset,
        from: period.from.toISOString(),
        to: period.to.toISOString()
      },
      totals: {
        openedTickets: openedTickets.length,
        closedTickets: closedTickets.length,
        completedTasks: events.filter((event) => event.type === "PROJECT_TASK_COMPLETED").length,
        contractChanges: events.filter((event) => event.category === "CONTRACTS").length,
        totalEvents: events.length + openedTickets.length + closedTickets.length
      },
      eventsByCategory,
      openedTickets: limitRows(
        openedTickets.map(({ ticket, occurredAt }) => ({
          glpiTicketId: ticket.glpiTicketId,
          title: ticket.title,
          status: ticket.status,
          assignedUserName: ticket.assignedUserName,
          contractGroupName: ticket.contractGroupName,
          occurredAt: occurredAt?.toISOString() ?? null
        })),
        80
      ),
      closedTickets: limitRows(
        closedTickets.map(({ ticket, occurredAt }) => ({
          glpiTicketId: ticket.glpiTicketId,
          title: ticket.title,
          status: ticket.status,
          assignedUserName: ticket.assignedUserName,
          contractGroupName: ticket.contractGroupName,
          occurredAt: occurredAt?.toISOString() ?? null
        })),
        80
      ),
      events: eventRows
    };
  }
}
