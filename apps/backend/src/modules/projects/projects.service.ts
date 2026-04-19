import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ImportProjectDto, ImportProjectGroupDto, ImportProjectTaskNodeDto } from "./projects.dto";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async importFromMonday(dto: ImportProjectDto): Promise<unknown> {
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
