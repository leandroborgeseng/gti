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

    const [contracts, modules, projects, tasks, governanceTickets, glpiTickets] = await Promise.all([
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
        take: 100,
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
        take: 100,
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
        take: 100,
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

    const now = new Date();

    return {
      user: {
        id: actor.userId,
        email: actor.email,
        fiscalProfile
      },
      totals: {
        contracts: contracts.length,
        modules: modules.length,
        projects: projects.length,
        tasks: tasks.length,
        governanceTickets: governanceTickets.length,
        glpiTickets: glpiTickets.length
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
        const done = project.tasks.filter((task) => normalizeText(task.status).includes("conclu") || normalizeText(task.status).includes("done")).length;
        const overdue = project.tasks.filter((task) => task.dueDate && task.dueDate < now && !(normalizeText(task.status).includes("conclu") || normalizeText(task.status).includes("done"))).length;
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
      tasks: tasks.map((task) => ({
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
      glpiTickets: glpiTickets
        .filter((ticket) =>
          ticket.requesterEmail?.toLowerCase() === actor.email.toLowerCase() ||
          containsAny(ticket.assignedUserName, candidates) ||
          containsAny(ticket.requesterEmail, candidates)
        )
        .map((ticket) => ({
          ...ticket,
          open: openTicketStatus(ticket.status)
        }))
    };
  }
}
