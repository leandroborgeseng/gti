import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { getAuditActorId, getAuditActorLabel } from "../../common/audit-actor";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import {
  CreateProjectCollectionDto,
  CreateProjectDto,
  CreateProjectTaskCommentDto,
  CreateProjectTaskDto,
  ImportProjectDto,
  ImportProjectGroupDto,
  ImportProjectTaskNodeDto,
  type ProjectFlatTaskRow,
  type ProjectsDashboardStats,
  type ProjectsTasksFlatResponse,
  UpdateProjectCollectionDto,
  UpdateProjectDto,
  UpdateProjectTaskDto
} from "./projects.dto";

const MAX_TASKS_FLAT_FETCH = 8000;
const PROJECT_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  displayName: true,
  profileColor: true,
  jobTitle: true,
  department: true,
  phone: true,
  role: true
} as const;

function parseProjectDate(value: string | null | undefined, fieldLabel: string): Date | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? new Date(`${trimmed}T00:00:00.000Z`) : new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${fieldLabel} inválida.`);
  }
  return date;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async create(dto: CreateProjectDto): Promise<unknown> {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("O nome do projeto é obrigatório.");
    }
    const projectCollectionId = typeof dto.projectCollectionId === "string" ? dto.projectCollectionId.trim() || null : null;
    if (projectCollectionId) {
      const group = await this.prisma.projectCollection.findUnique({ where: { id: projectCollectionId }, select: { id: true } });
      if (!group) throw new NotFoundException("Grupo de projetos não encontrado.");
    }
    const context = typeof dto.context === "string" ? dto.context.trim() || null : null;
    const startDate = parseProjectDate(dto.startDate, "Data de início");
    const plannedEndDate = parseProjectDate(dto.plannedEndDate, "Data de fim planejada");
    if (startDate && plannedEndDate && startDate > plannedEndDate) {
      throw new BadRequestException("A data de início não pode ser posterior à data de fim planejada.");
    }
    const supervisorId = typeof dto.supervisorId === "string" ? dto.supervisorId.trim() || null : null;
    if (supervisorId) {
      const supervisor = await this.prisma.user.findUnique({ where: { id: supervisorId }, select: { id: true } });
      if (!supervisor) throw new NotFoundException("Supervisor do projeto não encontrado.");
    }
    const created = await this.prisma.project.create({ data: { name, context, startDate, plannedEndDate, supervisorId, projectCollectionId } });
    return created;
  }

  async update(id: string, dto: UpdateProjectDto): Promise<unknown> {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("O nome do projeto é obrigatório.");
    }
    const exists = await this.prisma.project.findUnique({ where: { id }, select: { id: true, startDate: true, plannedEndDate: true } });
    if (!exists) throw new NotFoundException("Projeto não encontrado.");
    const data: Prisma.ProjectUpdateInput = { name };
    if (dto.context !== undefined) {
      const context = typeof dto.context === "string" ? dto.context.trim() : "";
      data.context = context || null;
    }
    if (dto.startDate !== undefined) {
      data.startDate = parseProjectDate(dto.startDate, "Data de início");
    }
    if (dto.plannedEndDate !== undefined) {
      data.plannedEndDate = parseProjectDate(dto.plannedEndDate, "Data de fim planejada");
    }
    const nextStartDate = data.startDate !== undefined ? (data.startDate as Date | null) : exists.startDate;
    const nextPlannedEndDate = data.plannedEndDate !== undefined ? (data.plannedEndDate as Date | null) : exists.plannedEndDate;
    if (nextStartDate && nextPlannedEndDate && nextStartDate > nextPlannedEndDate) {
      throw new BadRequestException("A data de início não pode ser posterior à data de fim planejada.");
    }
    if (dto.supervisorId !== undefined) {
      const supervisorId = typeof dto.supervisorId === "string" ? dto.supervisorId.trim() : "";
      if (supervisorId) {
        const supervisor = await this.prisma.user.findUnique({
          where: { id: supervisorId },
          select: { id: true }
        });
        if (!supervisor) throw new NotFoundException("Supervisor do projeto não encontrado.");
        data.supervisor = { connect: { id: supervisorId } };
      } else {
        data.supervisor = { disconnect: true };
      }
    }
    if (dto.projectCollectionId !== undefined) {
      const projectCollectionId = typeof dto.projectCollectionId === "string" ? dto.projectCollectionId.trim() : "";
      if (projectCollectionId) {
        const group = await this.prisma.projectCollection.findUnique({
          where: { id: projectCollectionId },
          select: { id: true }
        });
        if (!group) throw new NotFoundException("Grupo de projetos não encontrado.");
        data.projectCollection = { connect: { id: projectCollectionId } };
      } else {
        data.projectCollection = { disconnect: true };
      }
    }
    return this.prisma.project.update({ where: { id }, data });
  }

  async findSupervisors(): Promise<unknown> {
    return this.prisma.user.findMany({
      orderBy: { email: "asc" },
      select: PROJECT_USER_SELECT
    });
  }

  private normalizeUserIds(ids: string[] | undefined): string[] {
    return Array.from(new Set((ids ?? []).map((id) => id.trim()).filter(Boolean)));
  }

  private async loadTaskAssignmentUsers(assigneeUserId: string | null, responsibleUserIds: string[]): Promise<{
    assignee: { id: string; email: string; role: string } | null;
    responsible: { id: string; email: string; role: string }[];
  }> {
    const ids = Array.from(new Set([assigneeUserId, ...responsibleUserIds].filter((id): id is string => Boolean(id))));
    if (ids.length === 0) {
      return { assignee: null, responsible: [] };
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: PROJECT_USER_SELECT
    });
    if (users.length !== ids.length) {
      throw new NotFoundException("Um ou mais usuários selecionados não foram encontrados.");
    }
    const byId = new Map(users.map((user) => [user.id, user]));
    return {
      assignee: assigneeUserId ? (byId.get(assigneeUserId) ?? null) : null,
      responsible: responsibleUserIds.map((id) => byId.get(id)!).filter(Boolean)
    };
  }

  private async normalizeTaskGoal(_projectId: string, goalId: string | null | undefined): Promise<string | null> {
    const id = typeof goalId === "string" ? goalId.trim() : "";
    if (!id) return null;
    const goal = await this.prisma.goal.findUnique({ where: { id }, select: { id: true } });
    if (!goal) throw new NotFoundException("Meta não encontrada.");
    return goal.id;
  }

  private async normalizeTaskTicket(glpiTicketId: number | null | undefined): Promise<number | null> {
    if (glpiTicketId == null) return null;
    const id = Number(glpiTicketId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException("Número do chamado inválido.");
    }
    const ticket = await this.prisma.ticket.findUnique({ where: { glpiTicketId: id }, select: { glpiTicketId: true } });
    if (!ticket) throw new NotFoundException("Chamado GLPI não encontrado na base sincronizada.");
    return ticket.glpiTicketId;
  }

  private userLabel(user: { email: string; displayName?: string | null } | null | undefined): string | null {
    return user?.displayName?.trim() || user?.email?.trim() || null;
  }

  private taskResponsibleLabel(users: { email: string; displayName?: string | null }[]): string | null {
    const label = users.map((user) => this.userLabel(user)).filter(Boolean).join(", ");
    return label || null;
  }

  async findCollections(): Promise<unknown> {
    return this.prisma.projectCollection.findMany({
      orderBy: { name: "asc" },
      include: {
        projects: {
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            startDate: true,
            plannedEndDate: true,
            supervisorId: true,
            supervisor: { select: PROJECT_USER_SELECT },
            createdAt: true,
            updatedAt: true,
            _count: { select: { groups: true, tasks: true } }
          }
        },
        _count: { select: { projects: true } }
      }
    });
  }

  async createCollection(dto: CreateProjectCollectionDto): Promise<unknown> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("O nome do grupo é obrigatório.");
    return this.prisma.projectCollection.create({ data: { name } });
  }

  async updateCollection(id: string, dto: UpdateProjectCollectionDto): Promise<unknown> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("O nome do grupo é obrigatório.");
    const exists = await this.prisma.projectCollection.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("Grupo de projetos não encontrado.");
    return this.prisma.projectCollection.update({ where: { id }, data: { name } });
  }

  async deleteCollection(id: string): Promise<{ ok: true; id: string }> {
    const exists = await this.prisma.projectCollection.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("Grupo de projetos não encontrado.");
    await this.prisma.projectCollection.delete({ where: { id } });
    return { ok: true, id };
  }

  async delete(id: string): Promise<{ ok: true; id: string }> {
    const exists = await this.prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("Projeto não encontrado.");
    await this.prisma.project.delete({ where: { id } });
    return { ok: true, id };
  }

  /** Remove chaves extra (ex.: colunas Excel) para o ValidationPipe não rejeitar o corpo. */
  private sanitizeTaskNode(raw: unknown): ImportProjectTaskNodeDto | null {
    if (!raw || typeof raw !== "object") return null;
    const t = raw as Record<string, unknown>;
    const title = String(t.title ?? "").trim();
    if (!title) return null;
    const out: ImportProjectTaskNodeDto = { title };
    if (t.status != null && String(t.status).trim() !== "") out.status = String(t.status).trim();
    if (t.assigneeExternal != null && String(t.assigneeExternal).trim() !== "") {
      out.assigneeExternal = String(t.assigneeExternal).trim();
    }
    if (t.dueDate != null && String(t.dueDate).trim() !== "") {
      out.dueDate = String(t.dueDate).trim();
    } else if (t.dueDate === null) {
      out.dueDate = null;
    }
    if (t.description != null && String(t.description).trim() !== "") {
      out.description = String(t.description).trim();
    }
    if (t.effort != null && t.effort !== "") {
      const n = typeof t.effort === "number" ? t.effort : Number(String(t.effort).replace(",", "."));
      if (Number.isFinite(n)) out.effort = n;
    } else if (t.effort === null) {
      out.effort = null;
    }
    if (t.internalResponsible != null && String(t.internalResponsible).trim() !== "") {
      out.internalResponsible = String(t.internalResponsible).trim();
    }
    if (Array.isArray(t.children) && t.children.length) {
      const children = t.children.map((c) => this.sanitizeTaskNode(c)).filter((c): c is ImportProjectTaskNodeDto => c != null);
      if (children.length) out.children = children;
    }
    return out;
  }

  private sanitizeImportDto(raw: unknown): ImportProjectDto {
    if (!raw || typeof raw !== "object") {
      throw new BadRequestException("Corpo JSON inválido ou vazio.");
    }
    const b = raw as Record<string, unknown>;
    const name = String(b.name ?? "").trim();
    const groupsRaw = b.groups;
    if (!Array.isArray(groupsRaw) || groupsRaw.length === 0) {
      throw new BadRequestException("Indique pelo menos um grupo de tarefas.");
    }
    const groups: ImportProjectGroupDto[] = groupsRaw.map((gRaw, gi) => {
      if (!gRaw || typeof gRaw !== "object") {
        throw new BadRequestException(`Grupo ${gi + 1} inválido.`);
      }
      const g = gRaw as Record<string, unknown>;
      const gname = String(g.name ?? "").trim() || `Grupo ${gi + 1}`;
      const tasksRaw = g.tasks;
      const tasks: ImportProjectTaskNodeDto[] = [];
      if (Array.isArray(tasksRaw)) {
        for (const tr of tasksRaw) {
          const node = this.sanitizeTaskNode(tr);
          if (node) tasks.push(node);
        }
      }
      return { name: gname, tasks } as ImportProjectGroupDto;
    });
    return { name: name || "Projeto importado", groups } as ImportProjectDto;
  }

  async findAll(): Promise<unknown> {
    const projects = await this.prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        supervisor: { select: PROJECT_USER_SELECT },
        projectCollection: { select: { id: true, name: true } },
        goals: { select: { id: true, title: true, status: true, year: true } },
        _count: { select: { groups: true, tasks: true } }
      }
    });
    const meta = await this.prisma.projectTask.findMany({
      select: { projectId: true, dueDate: true, status: true }
    });
    const sod = this.startOfUtcDay();
    const statsByProject = new Map<
      string,
      {
        total: number;
        done: number;
        progress: number;
        blocked: number;
        notStarted: number;
        other: number;
        empty: number;
        overdueNotDone: number;
      }
    >();
    for (const t of meta) {
      const current =
        statsByProject.get(t.projectId) ??
        {
          total: 0,
          done: 0,
          progress: 0,
          blocked: 0,
          notStarted: 0,
          other: 0,
          empty: 0,
          overdueNotDone: 0
        };
      const kind = this.classifyTaskStatusForDashboard(t.status);
      current.total += 1;
      current[kind] += 1;
      if (this.isOverdueNotDone(t.dueDate, t.status, sod)) {
        current.overdueNotDone += 1;
      }
      statsByProject.set(t.projectId, current);
    }
    return projects.map((p) => ({
      ...p,
      _stats: {
        total: statsByProject.get(p.id)?.total ?? 0,
        done: statsByProject.get(p.id)?.done ?? 0,
        progress: statsByProject.get(p.id)?.progress ?? 0,
        blocked: statsByProject.get(p.id)?.blocked ?? 0,
        notStarted: statsByProject.get(p.id)?.notStarted ?? 0,
        other: statsByProject.get(p.id)?.other ?? 0,
        empty: statsByProject.get(p.id)?.empty ?? 0,
        overdueNotDone: statsByProject.get(p.id)?.overdueNotDone ?? 0,
        completionPercent: statsByProject.get(p.id)?.total ? Math.round(((statsByProject.get(p.id)?.done ?? 0) / statsByProject.get(p.id)!.total) * 100) : 0
      }
    }));
  }

  private async resolveTaskGroup(
    projectId: string,
    dto: Pick<CreateProjectTaskDto, "groupId" | "groupName" | "parentTaskId">
  ): Promise<string> {
    if (dto.parentTaskId?.trim()) {
      const parent = await this.prisma.projectTask.findFirst({
        where: { id: dto.parentTaskId.trim(), projectId },
        select: { groupId: true }
      });
      if (!parent) throw new NotFoundException("Tarefa pai não encontrada neste projeto.");
      return parent.groupId;
    }

    if (dto.groupId?.trim()) {
      const group = await this.prisma.projectGroup.findFirst({
        where: { id: dto.groupId.trim(), projectId },
        select: { id: true }
      });
      if (!group) throw new NotFoundException("Grupo não encontrado neste projeto.");
      return group.id;
    }

    const groupName = dto.groupName?.trim() || "Tarefas";
    const existing = await this.prisma.projectGroup.findFirst({
      where: { projectId, name: groupName },
      select: { id: true }
    });
    if (existing) return existing.id;

    const last = await this.prisma.projectGroup.findFirst({
      where: { projectId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true }
    });
    const created = await this.prisma.projectGroup.create({
      data: {
        projectId,
        name: groupName,
        sortOrder: (last?.sortOrder ?? -1) + 1
      },
      select: { id: true }
    });
    return created.id;
  }

  async createTask(projectId: string, dto: CreateProjectTaskDto): Promise<unknown> {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException("O título da tarefa é obrigatório.");

    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
    if (!project) throw new NotFoundException("Projeto não encontrado.");

    const groupId = await this.resolveTaskGroup(projectId, dto);
    const parentTaskId = dto.parentTaskId?.trim() || null;
    const last = await this.prisma.projectTask.findFirst({
      where: { projectId, groupId, parentTaskId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true }
    });

    let dueDate: Date | null = null;
    if (dto.dueDate?.trim()) {
      const d = new Date(dto.dueDate.trim());
      if (Number.isNaN(d.getTime())) throw new BadRequestException("Data inválida.");
      dueDate = d;
    }
    const assigneeUserId = dto.assigneeUserId?.trim() || null;
    const responsibleUserIds = this.normalizeUserIds(dto.responsibleUserIds);
    const assignmentUsers = await this.loadTaskAssignmentUsers(assigneeUserId, responsibleUserIds);
    const goalId = await this.normalizeTaskGoal(projectId, dto.goalId);
    const glpiTicketId = await this.normalizeTaskTicket(dto.glpiTicketId);

    const created = await this.prisma.projectTask.create({
      data: {
        projectId,
        groupId,
        parentTaskId,
        title,
        status: dto.status?.trim() || "Não iniciado",
        dueDate,
        description: dto.description?.trim() || null,
        assigneeExternal: (this.userLabel(assignmentUsers.assignee) ?? dto.assigneeExternal?.trim() ?? null) || null,
        assigneeUserId,
        internalResponsible: (this.taskResponsibleLabel(assignmentUsers.responsible) ?? dto.internalResponsible?.trim() ?? null) || null,
        effort: dto.effort != null && Number.isFinite(dto.effort) ? new Prisma.Decimal(dto.effort) : null,
        goalId,
        glpiTicketId,
        sortOrder: (last?.sortOrder ?? -1) + 1
      }
    });
    if (responsibleUserIds.length > 0) {
      await this.prisma.projectTaskResponsible.createMany({
        data: responsibleUserIds.map((userId) => ({ taskId: created.id, userId })),
        skipDuplicates: true
      });
    }
    await this.recordProjectEvent({
      type: "PROJECT_TASK_CREATED",
      entityId: created.id,
      title: `Tarefa criada: ${created.title}`,
      description: `Projeto: ${project.name}`,
      metadata: { projectId, projectName: project.name, status: created.status }
    });
    return {
      id: created.id,
      projectId: created.projectId,
      groupId: created.groupId,
      parentTaskId: created.parentTaskId,
      title: created.title,
      status: created.status,
      assigneeExternal: created.assigneeExternal,
      assigneeUserId: created.assigneeUserId,
      assigneeUser: assignmentUsers.assignee,
      dueDate: created.dueDate ? created.dueDate.toISOString() : null,
      description: created.description,
      effort: created.effort != null ? String(created.effort) : null,
      internalResponsible: created.internalResponsible,
      goalId: created.goalId,
      glpiTicketId: created.glpiTicketId,
      responsibleUsers: assignmentUsers.responsible.map((user) => ({ userId: user.id, user })),
      sortOrder: created.sortOrder,
      attachments: [],
      comments: []
    };
  }

  /**
   * Métricas globais (todos os projetos) para o mini dashboard na lista.
   * Regras de status alinhadas ao quadro Monday no frontend (`projects-task-status`).
   */
  async dashboardStats(): Promise<ProjectsDashboardStats> {
    const [projectCount, groupCount, tasks] = await Promise.all([
      this.prisma.project.count(),
      this.prisma.projectGroup.count(),
      this.prisma.projectTask.findMany({
        select: { projectId: true, parentTaskId: true, status: true, dueDate: true }
      })
    ]);

    const statusBreakdown: ProjectsDashboardStats["statusBreakdown"] = {
      done: 0,
      progress: 0,
      blocked: 0,
      notStarted: 0,
      other: 0,
      empty: 0
    };

    let rootTaskCount = 0;
    let subTaskCount = 0;
    let overdueNotDoneCount = 0;
    let tasksWithoutDueDateNotDone = 0;
    const projectsWithOverdue = new Set<string>();

    const sod = this.startOfUtcDay();

    for (const t of tasks) {
      if (t.parentTaskId) subTaskCount += 1;
      else rootTaskCount += 1;

      const kind = this.classifyTaskStatusForDashboard(t.status);
      statusBreakdown[kind] += 1;

      const done = kind === "done";
      if (t.dueDate == null) {
        if (!done) tasksWithoutDueDateNotDone += 1;
      } else if (this.isOverdueNotDone(t.dueDate, t.status, sod)) {
        overdueNotDoneCount += 1;
        projectsWithOverdue.add(t.projectId);
      }
    }

    return {
      projectCount,
      groupCount,
      taskCount: tasks.length,
      rootTaskCount,
      subTaskCount,
      statusBreakdown,
      overdueNotDoneCount,
      projectsWithOverdueCount: projectsWithOverdue.size,
      tasksWithoutDueDateNotDone
    };
  }

  private startOfUtcDay(d = new Date()): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  /** Tarefa com data limite antes do dia corrente (UTC) e não concluída. */
  private isOverdueNotDone(dueDate: Date | null, status: string, sod: Date): boolean {
    if (dueDate == null) return false;
    if (this.classifyTaskStatusForDashboard(status) === "done") return false;
    return dueDate < sod;
  }

  private normTaskStatusForDashboard(s: string): string {
    return s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .trim()
      .toLowerCase();
  }

  private classifyTaskStatusForDashboard(
    status: string
  ): "done" | "progress" | "blocked" | "notStarted" | "other" | "empty" {
    const raw = status.trim();
    if (!raw) return "empty";
    const n = this.normTaskStatusForDashboard(raw);
    if (n.includes("feito") || n.includes("conclu") || n.includes("done")) return "done";
    if (n.includes("progresso") || n.includes("andamento") || n.includes("progress")) return "progress";
    if (n.includes("parado") || n.includes("bloque") || n.includes("hold")) return "blocked";
    if (n.includes("nao") && n.includes("inici")) return "notStarted";
    return "other";
  }

  /**
   * Lista plana de tarefas (todos os projetos) com filtros e paginação em memória
   * após leitura limitada à banco de dados (ver `truncated`).
   */
  async findAllTasksFlat(raw: Record<string, string | string[] | undefined>): Promise<ProjectsTasksFlatResponse> {
    const pick = (key: string): string => {
      const v = raw[key];
      const s = Array.isArray(v) ? v[0] : v;
      return String(s ?? "").trim();
    };
    const limit = Math.min(2000, Math.max(1, Number.parseInt(pick("limit") || "500", 10) || 500));
    const offset = Math.max(0, Number.parseInt(pick("offset") || "0", 10) || 0);
    const filter = pick("filter");
    const statusKindRaw = pick("statusKind");
    const projectId = pick("projectId");
    const groupId = pick("groupId");
    const assignee = pick("assignee");
    const qTitle = pick("q");
    const onlyRoot = pick("onlyRoot") === "1" || pick("onlyRoot") === "true";
    const sort = pick("sort") || "dueDate";
    const order = pick("order") === "desc" ? "desc" : "asc";

    const validKinds = new Set(["done", "progress", "blocked", "notStarted", "other", "empty"]);
    const statusKind = validKinds.has(statusKindRaw) ? statusKindRaw : "";

    const where: Prisma.ProjectTaskWhereInput = {};
    if (projectId) where.projectId = projectId;
    if (groupId) where.groupId = groupId;
    if (onlyRoot) where.parentTaskId = null;
    if (assignee) where.assigneeExternal = { contains: assignee, mode: "insensitive" };
    if (qTitle) where.title = { contains: qTitle, mode: "insensitive" };

    const sod = this.startOfUtcDay();

    const fetched = await this.prisma.projectTask.findMany({
      where,
      take: MAX_TASKS_FLAT_FETCH,
      include: {
        project: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
        goal: { select: { id: true, title: true } }
      },
      orderBy: [{ projectId: "asc" }, { groupId: "asc" }, { sortOrder: "asc" }]
    });

    type Row = {
      id: string;
      projectId: string;
      projectName: string;
      groupId: string;
      groupName: string;
      parentTaskId: string | null;
      title: string;
      status: string;
      statusKind: ProjectFlatTaskRow["statusKind"];
      assigneeExternal: string | null;
      internalResponsible: string | null;
      dueDate: Date | null;
      goalId: string | null;
      goalTitle: string | null;
      glpiTicketId: number | null;
      sortOrder: number;
    };

    let rows: Row[] = fetched.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: t.project.name,
      groupId: t.groupId,
      groupName: t.group.name,
      parentTaskId: t.parentTaskId,
      title: t.title,
      status: t.status,
      statusKind: this.classifyTaskStatusForDashboard(t.status),
      assigneeExternal: t.assigneeExternal,
      internalResponsible: t.internalResponsible,
      dueDate: t.dueDate,
      goalId: t.goalId,
      goalTitle: t.goal?.title ?? null,
      glpiTicketId: t.glpiTicketId,
      sortOrder: t.sortOrder
    }));

    if (filter === "overdue") {
      rows = rows.filter((r) => this.isOverdueNotDone(r.dueDate, r.status, sod));
    } else if (filter === "no_due") {
      rows = rows.filter((r) => r.dueDate == null && this.classifyTaskStatusForDashboard(r.status) !== "done");
    }

    if (statusKind) {
      rows = rows.filter((r) => r.statusKind === statusKind);
    }

    rows = this.sortFlatTaskRows(rows, sort, order);

    const total = rows.length;
    const truncated = fetched.length >= MAX_TASKS_FLAT_FETCH;
    const slice = rows.slice(offset, offset + limit);

    const items: ProjectFlatTaskRow[] = slice.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.projectName,
      groupId: r.groupId,
      groupName: r.groupName,
      parentTaskId: r.parentTaskId,
      title: r.title,
      status: r.status,
      statusKind: r.statusKind,
      assigneeExternal: r.assigneeExternal,
      internalResponsible: r.internalResponsible,
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      goalId: r.goalId,
      goalTitle: r.goalTitle,
      glpiTicketId: r.glpiTicketId,
      sortOrder: r.sortOrder
    }));

    return { items, total, limit, offset, truncated };
  }

  private sortFlatTaskRows<
    T extends {
      dueDate: Date | null;
      title: string;
      status: string;
      projectName: string;
      groupName: string;
      sortOrder: number;
    }
  >(rows: T[], sort: string, order: "asc" | "desc"): T[] {
    const mul = order === "desc" ? -1 : 1;
    const cmpStr = (a: string, b: string) => a.localeCompare(b, "pt", { sensitivity: "base" }) * mul;
    const cmpNum = (a: number, b: number) => (a < b ? -mul : a > b ? mul : 0);
    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sort) {
        case "title":
          return cmpStr(a.title, b.title);
        case "status":
          return cmpStr(a.status, b.status);
        case "project":
          return cmpStr(a.projectName, b.projectName);
        case "group":
          return cmpStr(a.groupName, b.groupName);
        case "sortOrder":
          return cmpNum(a.sortOrder, b.sortOrder);
        case "dueDate":
        default: {
          const ta = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
          const tb = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
          if (ta === tb) return cmpStr(a.title, b.title);
          return ta < tb ? -mul : ta > tb ? mul : 0;
        }
      }
    });
    return sorted;
  }

  async bulkPatchTasks(raw: unknown): Promise<{ updated: number; failed: { taskId: string; message: string }[] }> {
    const items = this.parseBulkPatchItems(raw);
    const failed: { taskId: string; message: string }[] = [];
    let updated = 0;
    for (const it of items) {
      try {
        await this.updateTask(it.projectId, it.taskId, { status: it.status });
        updated += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed.push({ taskId: it.taskId, message: msg });
      }
    }
    return { updated, failed };
  }

  private parseBulkPatchItems(raw: unknown): { projectId: string; taskId: string; status: string }[] {
    if (!raw || typeof raw !== "object") {
      throw new BadRequestException("Corpo inválido.");
    }
    const items = (raw as { items?: unknown }).items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException("Indique items: array com pelo menos uma tarefa.");
    }
    if (items.length > 100) {
      throw new BadRequestException("Máximo de 100 tarefas por operação em massa.");
    }
    const out: { projectId: string; taskId: string; status: string }[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || typeof it !== "object") {
        throw new BadRequestException(`Item ${i + 1} inválido.`);
      }
      const o = it as Record<string, unknown>;
      const projectId = String(o.projectId ?? "").trim();
      const taskId = String(o.taskId ?? "").trim();
      const status = String(o.status ?? "").trim();
      if (!projectId || !taskId) {
        throw new BadRequestException(`Item ${i + 1}: projectId e taskId são obrigatórios.`);
      }
      if (!status) {
        throw new BadRequestException(`Item ${i + 1}: status não pode ficar vazio.`);
      }
      out.push({ projectId, taskId, status });
    }
    return out;
  }

  async findOne(id: string): Promise<unknown> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        supervisor: { select: PROJECT_USER_SELECT },
        projectCollection: {
          select: {
            id: true,
            name: true,
            projects: {
              where: { id: { not: id } },
              orderBy: { updatedAt: "desc" },
              select: {
                id: true,
                name: true,
                startDate: true,
                plannedEndDate: true,
                supervisorId: true,
                supervisor: { select: PROJECT_USER_SELECT },
                createdAt: true,
                updatedAt: true,
                _count: { select: { groups: true, tasks: true } }
              }
            }
          }
        },
        groups: { orderBy: { sortOrder: "asc" } }
        ,
        goals: { orderBy: [{ year: "desc" }, { createdAt: "desc" }], select: { id: true, title: true, status: true, year: true } }
      }
    });
    if (!project) throw new NotFoundException("Projeto não encontrado");

    const tasks = await this.prisma.projectTask.findMany({
      where: { projectId: id },
      orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }],
      include: {
        assigneeUser: { select: PROJECT_USER_SELECT },
        responsibleUsers: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: PROJECT_USER_SELECT } }
        },
        attachments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, fileName: true, mimeType: true, createdAt: true }
        },
        comments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, body: true, authorId: true, authorEmail: true, createdAt: true }
        },
        goal: { select: { id: true, title: true, status: true, year: true } },
        glpiTicket: { select: { glpiTicketId: true, title: true, status: true } }
      }
    });

    type Node = (typeof tasks)[number] & { children: Node[] };
    const byId = new Map<string, Node>();
    for (const t of tasks) {
      byId.set(t.id, { ...t, children: [] });
    }
    const rootsByGroup = new Map<string, Node[]>();
    for (const t of tasks) {
      const node = byId.get(t.id)!;
      if (t.parentTaskId) {
        byId.get(t.parentTaskId)?.children.push(node);
      } else {
        const list = rootsByGroup.get(t.groupId) ?? [];
        list.push(node);
        rootsByGroup.set(t.groupId, list);
      }
    }

    const sortTaskTree = (n: Node): Node => ({
      ...n,
      children: [...n.children].sort((a, b) => a.sortOrder - b.sortOrder).map(sortTaskTree)
    });

    const groupsWithTasks = project.groups.map((g) => ({
      ...g,
      tasks: [...(rootsByGroup.get(g.id) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).map(sortTaskTree)
    }));

    return { ...project, groups: groupsWithTasks };
  }

  async updateTask(projectId: string, taskId: string, dto: UpdateProjectTaskDto): Promise<unknown> {
    const hasPatch =
      dto.title !== undefined ||
      dto.status !== undefined ||
      dto.assigneeExternal !== undefined ||
      dto.assigneeUserId !== undefined ||
      dto.description !== undefined ||
      dto.internalResponsible !== undefined ||
      dto.responsibleUserIds !== undefined ||
      dto.goalId !== undefined ||
      dto.glpiTicketId !== undefined ||
      dto.dueDate !== undefined ||
      dto.effort !== undefined;
    if (!hasPatch) {
      throw new BadRequestException("Indique pelo menos um campo a atualizar.");
    }

    const exists = await this.prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
      select: { id: true, title: true, status: true, project: { select: { id: true, name: true } } }
    });
    if (!exists) {
      throw new NotFoundException("Tarefa não encontrada neste projeto.");
    }

    const data: Prisma.ProjectTaskUpdateInput = {};
    const assigneePatch = dto.assigneeUserId !== undefined;
    const responsiblePatch = dto.responsibleUserIds !== undefined;
    const assigneeUserId = assigneePatch ? dto.assigneeUserId?.trim() || null : null;
    const responsibleUserIds = responsiblePatch ? this.normalizeUserIds(dto.responsibleUserIds) : [];
    const assignmentUsers =
      assigneePatch || responsiblePatch
        ? await this.loadTaskAssignmentUsers(assigneePatch ? assigneeUserId : null, responsibleUserIds)
        : { assignee: null, responsible: [] };

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException("O título não pode ficar vazio.");
      data.title = title;
    }
    if (dto.status !== undefined) {
      data.status = dto.status.trim();
    }
    if (dto.assigneeExternal !== undefined) {
      const v = dto.assigneeExternal.trim();
      data.assigneeExternal = v === "" ? null : v;
    }
    if (assigneePatch) {
      data.assigneeUser = assigneeUserId ? { connect: { id: assigneeUserId } } : { disconnect: true };
      data.assigneeExternal = this.userLabel(assignmentUsers.assignee);
    }
    if (dto.description !== undefined) {
      const v = dto.description.trim();
      data.description = v === "" ? null : v;
    }
    if (dto.internalResponsible !== undefined) {
      const v = dto.internalResponsible.trim();
      data.internalResponsible = v === "" ? null : v;
    }
    if (responsiblePatch) {
      data.internalResponsible = this.taskResponsibleLabel(assignmentUsers.responsible);
    }
    if (dto.goalId !== undefined) {
      const goalId = await this.normalizeTaskGoal(projectId, dto.goalId);
      data.goal = goalId ? { connect: { id: goalId } } : { disconnect: true };
    }
    if (dto.glpiTicketId !== undefined) {
      const glpiTicketId = await this.normalizeTaskTicket(dto.glpiTicketId);
      data.glpiTicket = glpiTicketId ? { connect: { glpiTicketId } } : { disconnect: true };
    }
    if (dto.dueDate !== undefined) {
      const raw = dto.dueDate.trim();
      if (raw === "") {
        data.dueDate = null;
      } else {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestException("Data inválida.");
        }
        data.dueDate = d;
      }
    }
    if (dto.effort !== undefined) {
      if (!Number.isFinite(dto.effort)) {
        throw new BadRequestException("Esforço (número) inválido.");
      }
      data.effort = new Prisma.Decimal(dto.effort);
    }

    await this.prisma.projectTask.update({
      where: { id: taskId },
      data
    });
    if (responsiblePatch) {
      await this.prisma.projectTaskResponsible.deleteMany({ where: { taskId } });
      if (responsibleUserIds.length > 0) {
        await this.prisma.projectTaskResponsible.createMany({
          data: responsibleUserIds.map((userId) => ({ taskId, userId })),
          skipDuplicates: true
        });
      }
    }

    const updated = await this.prisma.projectTask.findUniqueOrThrow({
      where: { id: taskId },
      include: {
        assigneeUser: { select: PROJECT_USER_SELECT },
        responsibleUsers: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: PROJECT_USER_SELECT } }
        },
        attachments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, fileName: true, mimeType: true, createdAt: true }
        },
        comments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, body: true, authorId: true, authorEmail: true, createdAt: true }
        },
        goal: { select: { id: true, title: true, status: true, year: true } },
        glpiTicket: { select: { glpiTicketId: true, title: true, status: true } }
      }
    });

    const wasDone = this.classifyTaskStatusForDashboard(exists.status) === "done";
    const isDone = this.classifyTaskStatusForDashboard(updated.status) === "done";
    if (!wasDone && isDone) {
      await this.recordProjectEvent({
        type: "PROJECT_TASK_COMPLETED",
        entityId: updated.id,
        title: `Tarefa concluída: ${updated.title}`,
        description: `Projeto: ${exists.project.name}`,
        metadata: {
          projectId,
          projectName: exists.project.name,
          statusBefore: exists.status,
          statusAfter: updated.status
        }
      });
    } else if (dto.status !== undefined && exists.status !== updated.status) {
      await this.recordProjectEvent({
        type: "PROJECT_TASK_STATUS_CHANGED",
        entityId: updated.id,
        title: `Status de tarefa alterado: ${updated.title}`,
        description: `Projeto: ${exists.project.name} · ${exists.status || "sem status"} → ${updated.status || "sem status"}`,
        metadata: {
          projectId,
          projectName: exists.project.name,
          statusBefore: exists.status,
          statusAfter: updated.status
        }
      });
    }

    return {
      id: updated.id,
      projectId: updated.projectId,
      groupId: updated.groupId,
      parentTaskId: updated.parentTaskId,
      title: updated.title,
      status: updated.status,
      assigneeExternal: updated.assigneeExternal,
      assigneeUserId: updated.assigneeUserId,
      assigneeUser: updated.assigneeUser,
      dueDate: updated.dueDate ? updated.dueDate.toISOString() : null,
      description: updated.description,
      effort: updated.effort != null ? String(updated.effort) : null,
      internalResponsible: updated.internalResponsible,
      goalId: updated.goalId,
      goal: updated.goal,
      glpiTicketId: updated.glpiTicketId,
      glpiTicket: updated.glpiTicket,
      responsibleUsers: updated.responsibleUsers.map((responsible) => ({
        userId: responsible.userId,
        user: responsible.user
      })),
      sortOrder: updated.sortOrder,
      attachments: updated.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        createdAt: a.createdAt.toISOString()
      })),
      comments: updated.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        authorId: comment.authorId,
        authorEmail: comment.authorEmail,
        createdAt: comment.createdAt.toISOString()
      }))
    };
  }

  async deleteTask(projectId: string, taskId: string): Promise<{ ok: true; id: string }> {
    const exists = await this.prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
      select: { id: true }
    });
    if (!exists) {
      throw new NotFoundException("Tarefa não encontrada neste projeto.");
    }
    await this.prisma.projectTask.delete({ where: { id: taskId } });
    return { ok: true, id: taskId };
  }

  async addTaskAttachment(projectId: string, taskId: string, file: Express.Multer.File): Promise<unknown> {
    const task = await this.prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
      select: { id: true }
    });
    if (!task) {
      throw new NotFoundException("Tarefa não encontrada neste projeto.");
    }
    if (!file.buffer?.length) {
      throw new BadRequestException("Arquivo vazio.");
    }
    const { filePath } = await this.storage.saveProjectTaskFile(taskId, file.buffer, file.originalname, file.mimetype);
    const attachment = await this.prisma.attachment.create({
      data: {
        projectTaskId: taskId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        filePath
      },
      select: { id: true, fileName: true, mimeType: true, createdAt: true }
    });
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      createdAt: attachment.createdAt.toISOString()
    };
  }

  async removeTaskAttachment(projectId: string, taskId: string, attachmentId: string): Promise<{ ok: true }> {
    const att = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        projectTaskId: taskId,
        projectTask: { projectId }
      }
    });
    if (!att) {
      throw new NotFoundException("Anexo não encontrado nesta tarefa.");
    }
    await this.storage.unlinkStoredByRelativeSafe(att.filePath);
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    return { ok: true };
  }

  async addTaskComment(projectId: string, taskId: string, dto: CreateProjectTaskCommentDto): Promise<unknown> {
    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException("Escreva um comentário antes de salvar.");
    }
    const task = await this.prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
      select: { id: true, title: true, project: { select: { id: true, name: true } } }
    });
    if (!task) {
      throw new NotFoundException("Tarefa não encontrada neste projeto.");
    }
    const authorId = getAuditActorId();
    const authorEmail = getAuditActorLabel() || null;
    const comment = await this.prisma.projectTaskComment.create({
      data: {
        taskId,
        authorId: authorId || null,
        authorEmail,
        body
      },
      select: { id: true, body: true, authorId: true, authorEmail: true, createdAt: true }
    });
    await this.recordProjectEvent({
      type: "PROJECT_TASK_COMMENT_CREATED",
      entityId: task.id,
      title: `Comentário adicionado: ${task.title}`,
      description: `Projeto: ${task.project.name}`,
      metadata: { projectId, projectName: task.project.name, commentId: comment.id }
    });
    return {
      id: comment.id,
      body: comment.body,
      authorId: comment.authorId,
      authorEmail: comment.authorEmail,
      createdAt: comment.createdAt.toISOString()
    };
  }

  async importFromMonday(raw: unknown): Promise<unknown> {
    const dto = this.sanitizeImportDto(raw);
    const totalTasks = dto.groups.reduce((n, g) => n + (g.tasks?.length ?? 0), 0);
    if (totalTasks === 0) {
      throw new BadRequestException(
        "Nenhuma tarefa válida no payload. Confirme a prévia no assistente ou reexporte o Excel do Monday (cabeçalhos Name, Status, …)."
      );
    }

    /** Importações Monday podem ter centenas de linhas; o timeout por padrão (~5s) cancela a transacção a meio. */
    const created = await this.prisma.$transaction(
      async (tx) => {
        const project = await tx.project.create({
          data: { name: dto.name.trim() }
        });

        for (let gi = 0; gi < dto.groups.length; gi++) {
          const g = dto.groups[gi];
          const group = await tx.projectGroup.create({
            data: {
              projectId: project.id,
              name: g.name.trim(),
              sortOrder: gi
            }
          });

          let sortCounter = 0;
          const walk = async (parentId: string | null, nodes: ImportProjectTaskNodeDto[]): Promise<void> => {
            for (const node of nodes) {
              const task = await tx.projectTask.create({
                data: {
                  projectId: project.id,
                  groupId: group.id,
                  parentTaskId: parentId,
                  title: node.title.trim(),
                  status: (node.status ?? "").trim(),
                  assigneeExternal: node.assigneeExternal?.trim() || null,
                  dueDate: node.dueDate ? new Date(node.dueDate) : null,
                  description: node.description?.trim() || null,
                  effort:
                    node.effort != null && Number.isFinite(node.effort) ? new Prisma.Decimal(node.effort) : null,
                  internalResponsible: node.internalResponsible?.trim() || null,
                  sortOrder: sortCounter++
                }
              });
              if (node.children?.length) {
                await walk(task.id, node.children);
              }
            }
          };

          await walk(null, g.tasks ?? []);
        }

        return project.id;
      },
      {
        maxWait: 20_000,
        timeout: 180_000
      }
    );

    return this.findOne(created);
  }

  private async recordProjectEvent(input: {
    type: string;
    entityId: string;
    title: string;
    description?: string | null;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.operationalEvent.create({
      data: {
        type: input.type,
        category: "PROJECTS",
        entity: "ProjectTask",
        entityId: input.entityId,
        title: input.title,
        description: input.description ?? null,
        actorId: getAuditActorId(),
        actorLabel: getAuditActorLabel(),
        metadata: input.metadata
      }
    });
  }
}
