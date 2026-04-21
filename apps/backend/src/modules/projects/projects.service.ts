import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import {
  ImportProjectDto,
  ImportProjectGroupDto,
  ImportProjectTaskNodeDto,
  type ProjectsDashboardStats,
  UpdateProjectTaskDto
} from "./projects.dto";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

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
    return this.prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { groups: true, tasks: true } }
      }
    });
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

    const now = new Date();
    const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    for (const t of tasks) {
      if (t.parentTaskId) subTaskCount += 1;
      else rootTaskCount += 1;

      const kind = this.classifyTaskStatusForDashboard(t.status);
      statusBreakdown[kind] += 1;

      const done = kind === "done";
      if (t.dueDate == null) {
        if (!done) tasksWithoutDueDateNotDone += 1;
      } else if (t.dueDate < startOfUtcDay && !done) {
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

  async findOne(id: string): Promise<unknown> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
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
