import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";

type AssignmentActor = {
  userId: string;
  email: string;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function containsAny(text: string | null | undefined, candidates: string[]): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return candidates.some((candidate) => candidate.length >= 3 && normalized.includes(candidate));
}

function openTicketStatus(status: string | null | undefined): boolean {
  return !["solved", "closed", "fechado", "resolvido", "6", "5"].includes(normalizeText(status));
}

/** Alinhado ao frontend (`classifyStatus` === done): feito / concluído / done. */
function projectTaskCompleted(status: string | null | undefined): boolean {
  const n = normalizeText(status);
  if (!n) return false;
  return n.includes("feito") || n.includes("conclu") || n.includes("done");
}

function compareTaskDueAsc(a: { dueDate: Date | null }, b: { dueDate: Date | null }): number {
  const ta = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const tb = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return ta - tb;
}

function compareTaskDueDesc(a: { dueDate: Date | null }, b: { dueDate: Date | null }): number {
  return compareTaskDueAsc(b, a);
}

const ASSIGNMENTS_LIST_CAP = 100;

@Injectable()
export class UserAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async mine(actor: AssignmentActor): Promise<unknown> {
    const fiscalProfile = await this.prisma.fiscal.findUnique({
      where: { userId: actor.userId },
      select: { id: true, name: true, email: true }
    });
    const emailLocalPart = actor.email.split("@")[0] ?? "";
    const candidates = [actor.email, emailLocalPart, fiscalProfile?.email, fiscalProfile?.name]
      .map(normalizeText)
      .filter(Boolean);
    const insensitive = Prisma.QueryMode.insensitive;
    const taskMatches: Prisma.ProjectTaskWhereInput[] = [
      { assigneeUserId: actor.userId },
      { responsibleUsers: { some: { userId: actor.userId } } },
      { internalResponsible: { contains: actor.email, mode: insensitive } },
      { assigneeExternal: { contains: actor.email, mode: insensitive } }
    ];
    if (emailLocalPart.length >= 3) {
      taskMatches.push(
        { internalResponsible: { contains: emailLocalPart, mode: insensitive } },
        { assigneeExternal: { contains: emailLocalPart, mode: insensitive } }
      );
    }
    if (fiscalProfile?.name) {
      taskMatches.push(
        { internalResponsible: { contains: fiscalProfile.name, mode: insensitive } },
        { assigneeExternal: { contains: fiscalProfile.name, mode: insensitive } }
      );
    }
    const ticketMatches: Prisma.TicketWhereInput[] = [
      { requesterEmail: { equals: actor.email, mode: insensitive } },
      { requesterEmail: { contains: actor.email, mode: insensitive } }
    ];
    if (emailLocalPart.length >= 3) {
      ticketMatches.push({ assignedUserName: { contains: emailLocalPart, mode: insensitive } });
    }
    if (fiscalProfile?.name) {
      ticketMatches.push({ assignedUserName: { contains: fiscalProfile.name, mode: insensitive } });
    }

    const [contracts, modules, projects, tasks, governanceTickets, glpiTicketRows] = await Promise.all([
      fiscalProfile
        ? this.prisma.contract.findMany({
            where: {
              deletedAt: null,
              OR: [{ fiscalId: fiscalProfile.id }, { managerId: fiscalProfile.id }]
            },
            orderBy: [{ status: "asc" }, { endDate: "asc" }],
            select: {
              id: true,
              number: true,
              name: true,
              status: true,
              endDate: true,
              fiscalId: true,
              managerId: true
            }
          })
        : Promise.resolve([]),
      this.prisma.contractModule.findMany({
        where: { validatorId: actor.userId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          criticality: true,
          weight: true,
          contract: { select: { id: true, number: true, name: true, status: true } },
          features: { select: { deliveryStatus: true } }
        }
      }),
      this.prisma.project.findMany({
        where: { supervisorId: actor.userId },
        orderBy: [{ plannedEndDate: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          name: true,
          startDate: true,
          plannedEndDate: true,
          updatedAt: true,
          tasks: { select: { status: true, dueDate: true } }
        }
      }),
      this.prisma.projectTask.findMany({
        where: { OR: taskMatches },
        orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
        take: ASSIGNMENTS_LIST_CAP,
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          internalResponsible: true,
          assigneeExternal: true,
          project: { select: { id: true, name: true } },
          group: { select: { id: true, name: true } }
        }
      }),
      this.prisma.ticketGovernance.findMany({
        where: { watchers: { some: { userId: actor.userId } } },
        orderBy: [{ status: "asc" }, { slaDeadline: "asc" }],
        take: ASSIGNMENTS_LIST_CAP,
        select: {
          id: true,
          ticketId: true,
          status: true,
          priority: true,
          slaDeadline: true,
          contract: { select: { id: true, number: true, name: true } },
          watchers: { where: { userId: actor.userId }, select: { role: true } }
        }
      }),
      this.prisma.ticket.findMany({
        where: { OR: ticketMatches },
        orderBy: [{ dateModification: "desc" }],
        take: ASSIGNMENTS_LIST_CAP,
        select: {
          glpiTicketId: true,
          title: true,
          status: true,
          priority: true,
          dateCreation: true,
          dateModification: true,
          assignedUserName: true,
          requesterEmail: true,
          contractGroupName: true
        }
      })
    ]);

    const tasksTruncated = tasks.length >= ASSIGNMENTS_LIST_CAP;
    const governanceTruncated = governanceTickets.length >= ASSIGNMENTS_LIST_CAP;
    const glpiTruncated = glpiTicketRows.length >= ASSIGNMENTS_LIST_CAP;

    const tasksPending = tasks.filter((t) => !projectTaskCompleted(t.status)).sort(compareTaskDueAsc);
    const tasksDone = tasks.filter((t) => projectTaskCompleted(t.status)).sort(compareTaskDueDesc);
    const tasksOrdered = [...tasksPending, ...tasksDone];

    const now = new Date();

    const glpiTicketsFiltered = glpiTicketRows.filter(
      (ticket) =>
        ticket.requesterEmail?.toLowerCase() === actor.email.toLowerCase() ||
        containsAny(ticket.assignedUserName, candidates) ||
        containsAny(ticket.requesterEmail, candidates)
    );

    return {
      user: {
        id: actor.userId,
        email: actor.email,
        fiscalProfile
      },
      listLimits: {
        maxItemsPerList: ASSIGNMENTS_LIST_CAP,
        tasksTruncated,
        governanceTruncated,
        glpiTruncated
      },
      totals: {
        contracts: contracts.length,
        modules: modules.length,
        projects: projects.length,
        tasks: tasksPending.length,
        governanceTickets: governanceTickets.length,
        glpiTickets: glpiTicketsFiltered.length
      },
      contracts: contracts.map((contract) => ({
        ...contract,
        role: contract.fiscalId === fiscalProfile?.id && contract.managerId === fiscalProfile?.id
          ? "Fiscal e gestor"
          : contract.fiscalId === fiscalProfile?.id
            ? "Fiscal"
            : "Gestor",
        endDate: contract.endDate.toISOString()
      })),
      modules: modules.map((mod) => {
        const delivered = mod.features.filter((f) => f.deliveryStatus === "DELIVERED").length;
        const partial = mod.features.filter((f) => f.deliveryStatus === "PARTIALLY_DELIVERED").length;
        const total = mod.features.length;
        return {
          id: mod.id,
          name: mod.name,
          criticality: mod.criticality,
          weight: String(mod.weight),
          contract: mod.contract,
          status: `${delivered}/${total} entregues${partial > 0 ? `, ${partial} parciais` : ""}`,
          delivered,
          partial,
          total
        };
      }),
      projects: projects.map((project) => {
        const total = project.tasks.length;
        const done = project.tasks.filter((task) => projectTaskCompleted(task.status)).length;
        const overdue = project.tasks.filter(
          (task) =>
            task.dueDate &&
            task.dueDate < now &&
            !projectTaskCompleted(task.status)
        ).length;
        return {
          id: project.id,
          name: project.name,
          startDate: project.startDate?.toISOString() ?? null,
          plannedEndDate: project.plannedEndDate?.toISOString() ?? null,
          updatedAt: project.updatedAt.toISOString(),
          status: `${done}/${total} tarefas concluídas${overdue > 0 ? `, ${overdue} atrasada(s)` : ""}`,
          total,
          done,
          overdue
        };
      }),
      tasks: tasksOrdered.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status || "Sem status",
        dueDate: task.dueDate?.toISOString() ?? null,
        internalResponsible: task.internalResponsible,
        assigneeExternal: task.assigneeExternal,
        project: task.project,
        group: task.group
      })),
      governanceTickets: governanceTickets.map((ticket) => ({
        ...ticket,
        slaDeadline: ticket.slaDeadline?.toISOString() ?? null,
        role: ticket.watchers.map((watcher) => watcher.role).join(", ") || "Observador"
      })),
      glpiTickets: glpiTicketsFiltered.map((ticket) => ({
        ...ticket,
        open: openTicketStatus(ticket.status)
      }))
    };
  }
}
