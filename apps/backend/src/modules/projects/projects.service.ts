import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import {
  CreateProjectCollectionDto,
  CreateProjectDto,
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
    const supervisorId = typeof dto.supervisorId === "string" ? dto.supervisorId.trim() || null : null;
    if (supervisorId) {
      const supervisor = await this.prisma.user.findUnique({ where: { id: supervisorId }, select: { id: true } });
      if (!supervisor) throw new NotFoundException("Supervisor do projeto não encontrado.");
    }
    const created = await this.prisma.project.create({ data: { name, context, supervisorId, projectCollectionId } });
    return created;
  }

  async update(id: string, dto: UpdateProjectDto): Promise<unknown> {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("O nome do projeto é obrigatório.");
    }
    const exists = await this.prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("Projeto não encontrado.");
    const data: Prisma.ProjectUpdateInput = { name };
    if (dto.context !== undefined) {
      const context = typeof dto.context === "string" ? dto.context.trim() : "";
      data.context = context || null;
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
      select: { id: true, email: true, role: true }
    });
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
            supervisorId: true,
            supervisor: { select: { id: true, email: true, role: true } },
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
        supervisor: { select: { id: true, email: true, role: true } },
        projectCollection: { select: { id: true, name: true } },
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

    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
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

    const created = await this.prisma.projectTask.create({
      data: {
        projectId,
        groupId,
        parentTaskId,
        title,
        status: dto.status?.trim() || "Não iniciado",
        dueDate,
        description: dto.description?.trim() || null,
        assigneeExternal: dto.assigneeExternal?.trim() || null,
        internalResponsible: dto.internalResponsible?.trim() || null,
        effort: dto.effort != null && Number.isFinite(dto.effort) ? new Prisma.Decimal(dto.effort) : null,
        sortOrder: (last?.sortOrder ?? -1) + 1
      }
    });
    return {
      id: created.id,
      projectId: created.projectId,
      groupId: created.groupId,
      parentTaskId: created.parentTaskId,
      title: created.title,
      status: created.status,
      assigneeExternal: created.assigneeExternal,
      dueDate: created.dueDate ? created.dueDate.toISOString() : null,
      description: created.description,
      effort: created.effort != null ? String(created.effort) : null,
      internalResponsible: created.internalResponsible,
      sortOrder: created.sortOrder,
      attachments: []
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
   * após leitura limitada à BD (ver `truncated`).
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
        group: { select: { id: true, name: true } }
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
        supervisor: { select: { id: true, email: true, role: true } },
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
                supervisorId: true,
                supervisor: { select: { id: true, email: true, role: true } },
                createdAt: true,
                updatedAt: true,
                _count: { select: { groups: true, tasks: true } }
              }
            }
          }
        },
        groups: { orderBy: { sortOrder: "asc" } }
      }
    });
    if (!project) throw new NotFoundException("Projeto não encontrado");

    const tasks = await this.prisma.projectTask.findMany({
      where: { projectId: id },
      orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }],
      include: {
        attachments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, fileName: true, mimeType: true, createdAt: true }
        }
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
      dto.description !== undefined ||
      dto.internalResponsible !== undefined ||
      dto.dueDate !== undefined ||
      dto.effort !== undefined;
    if (!hasPatch) {
      throw new BadRequestException("Indique pelo menos um campo a atualizar.");
    }

    const exists = await this.prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
      select: { id: true }
    });
    if (!exists) {
      throw new NotFoundException("Tarefa não encontrada neste projeto.");
    }

    const data: Prisma.ProjectTaskUpdateInput = {};

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
    if (dto.description !== undefined) {
      const v = dto.description.trim();
      data.description = v === "" ? null : v;
    }
    if (dto.internalResponsible !== undefined) {
      const v = dto.internalResponsible.trim();
      data.internalResponsible = v === "" ? null : v;
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

    const updated = await this.prisma.projectTask.update({
      where: { id: taskId },
      data,
      include: {
        attachments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, fileName: true, mimeType: true, createdAt: true }
        }
      }
    });

    return {
      id: updated.id,
      projectId: updated.projectId,
      groupId: updated.groupId,
      parentTaskId: updated.parentTaskId,
      title: updated.title,
      status: updated.status,
      assigneeExternal: updated.assigneeExternal,
      dueDate: updated.dueDate ? updated.dueDate.toISOString() : null,
      description: updated.description,
      effort: updated.effort != null ? String(updated.effort) : null,
      internalResponsible: updated.internalResponsible,
      sortOrder: updated.sortOrder,
      attachments: updated.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        createdAt: a.createdAt.toISOString()
      }))
    };
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
      throw new BadRequestException("Ficheiro vazio.");
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

  async importFromMonday(raw: unknown): Promise<unknown> {
    const dto = this.sanitizeImportDto(raw);
    const totalTasks = dto.groups.reduce((n, g) => n + (g.tasks?.length ?? 0), 0);
    if (totalTasks === 0) {
      throw new BadRequestException(
        "Nenhuma tarefa válida no payload. Confirme a pré-visualização no assistente ou reexporte o Excel do Monday (cabeçalhos Name, Status, …)."
      );
    }

    /** Importações Monday podem ter centenas de linhas; o timeout por defeito (~5s) cancela a transacção a meio. */
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
}
