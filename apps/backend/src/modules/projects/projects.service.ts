import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ImportProjectDto, ImportProjectGroupDto, ImportProjectTaskNodeDto } from "./projects.dto";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

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
      orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }]
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

    const groupsWithTasks = project.groups.map((g) => ({
      ...g,
      tasks: rootsByGroup.get(g.id) ?? []
    }));

    return { ...project, groups: groupsWithTasks };
  }

  async importFromMonday(raw: unknown): Promise<unknown> {
    const dto = this.sanitizeImportDto(raw);
    const totalTasks = dto.groups.reduce((n, g) => n + (g.tasks?.length ?? 0), 0);
    if (totalTasks === 0) {
      throw new BadRequestException(
        "Nenhuma tarefa válida no payload. Confirme a pré-visualização no assistente ou reexporte o Excel do Monday (cabeçalhos Name, Status, …)."
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
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
    });

    return this.findOne(created);
  }
}
