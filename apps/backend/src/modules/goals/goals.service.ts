import { Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { GoalStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateGoalActionDto,
  CreateGoalDto,
  LinkGoalDto,
  ManualProgressDto,
  UpdateGoalActionDto,
  UpdateGoalDto
} from "./goals.dto";

type SeedGoal = {
  title: string;
  status: GoalStatus;
  year: number;
};

@Injectable()
export class GoalsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.seedInitialGoals();
  }

  async create(dto: CreateGoalDto): Promise<unknown> {
    const created = await this.prisma.goal.create({
      data: {
        ...dto,
        status: dto.status ?? "PLANNED",
        priority: dto.priority?.trim() || "MÉDIA"
      }
    });
    await this.createAudit("Goal", created.id, "CREATE", null, created);
    return this.findOne(created.id);
  }

  async findAll(): Promise<unknown> {
    return this.prisma.goal.findMany({
      include: { actions: true, links: true },
      orderBy: [{ year: "desc" }, { createdAt: "desc" }]
    });
  }

  async findOne(id: string): Promise<unknown> {
    const goal = await this.prisma.goal.findUnique({
      where: { id },
      include: { actions: true, links: true }
    });
    if (!goal) throw new NotFoundException("Meta não encontrada");
    const calculatedProgress = this.calculateProgress(goal.actions.map((a) => a.progress));
    return { ...goal, calculatedProgress };
  }

  async update(id: string, dto: UpdateGoalDto): Promise<unknown> {
    const prev = await this.requireGoal(id);
    const updated = await this.prisma.goal.update({
      where: { id },
      data: {
        ...dto,
        priority: dto.priority?.trim() || undefined
      }
    });
    await this.createAudit("Goal", id, "UPDATE", prev, updated);
    return this.findOne(id);
  }

  async addAction(goalId: string, dto: CreateGoalActionDto): Promise<unknown> {
    await this.requireGoal(goalId);
    const created = await this.prisma.goalAction.create({
      data: {
        goalId,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        progress: dto.progress,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        responsibleId: dto.responsibleId
      }
    });
    await this.recalculateGoalStatus(goalId);
    await this.createAudit("GoalAction", created.id, "CREATE", null, created);
    return created;
  }

  async updateAction(goalId: string, actionId: string, dto: UpdateGoalActionDto): Promise<unknown> {
    await this.requireGoal(goalId);
    const prev = await this.prisma.goalAction.findFirst({ where: { id: actionId, goalId } });
    if (!prev) throw new NotFoundException("Ação da meta não encontrada");
    const updated = await this.prisma.goalAction.update({
      where: { id: actionId },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        progress: dto.progress,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        responsibleId: dto.responsibleId
      }
    });
    await this.recalculateGoalStatus(goalId);
    await this.createAudit("GoalAction", actionId, "UPDATE", prev, updated);
    return updated;
  }

  async setManualProgress(goalId: string, dto: ManualProgressDto): Promise<unknown> {
    await this.requireGoal(goalId);
    const updated = await this.prisma.goalAction.create({
      data: {
        goalId,
        title: "Ajuste manual de progresso",
        description: "Ajuste manual registrado na meta para fins de governança.",
        progress: dto.progress,
        status: dto.progress >= 100 ? "COMPLETED" : dto.progress > 0 ? "IN_PROGRESS" : "NOT_STARTED",
        responsibleId: "manual"
      }
    });
    await this.createAudit("GoalAction", updated.id, "CREATE_MANUAL_PROGRESS", null, updated);
    await this.recalculateGoalStatus(goalId);
    await this.createAudit("Goal", goalId, "MANUAL_PROGRESS", null, { progress: dto.progress });
    return updated;
  }

  async link(goalId: string, dto: LinkGoalDto): Promise<unknown> {
    await this.requireGoal(goalId);
    const created = await this.prisma.goalLink.create({
      data: { goalId, type: dto.type, referenceId: dto.referenceId }
    });
    await this.createAudit("GoalLink", created.id, "CREATE", null, created);
    return created;
  }

  async dashboard(): Promise<unknown> {
    const goals = await this.prisma.goal.findMany({ include: { actions: true } });
    const now = new Date();
    const planned = goals.filter((g) => g.status === "PLANNED").length;
    const inProgress = goals.filter((g) => g.status === "IN_PROGRESS").length;
    const completed = goals.filter((g) => g.status === "COMPLETED").length;
    const averageProgress =
      goals.length === 0
        ? 0
        : goals.reduce((acc, goal) => acc + this.calculateProgress(goal.actions.map((a) => a.progress)), 0) / goals.length;
    const overdueGoals = goals.filter((goal) =>
      goal.actions.some((action) => action.dueDate && action.dueDate < now && action.status !== "COMPLETED")
    ).length;

    return {
      planned,
      inProgress,
      completed,
      averageProgress: Number(averageProgress.toFixed(2)),
      overdueGoals
    };
  }

  private async seedInitialGoals(): Promise<void> {
    const seedGoals: SeedGoal[] = [
      { title: "Implantação de Termo de Responsabilidade/Compromisso para usuários de Assinatura Eletrônica", status: "PLANNED", year: 2026 },
      { title: "Identificação e tratativas dos riscos de TIC — ISO/IEC 27000", status: "PLANNED", year: 2026 },
      { title: "Identificação e tratativas dos riscos de TIC — ISO 31000", status: "PLANNED", year: 2026 },
      { title: "Elaboração do Plano de Continuidade de TIC", status: "PLANNED", year: 2026 },
      { title: "Regulamentação da Lei 14.129/2021", status: "PLANNED", year: 2026 },
      { title: "Dados abertos (JSON, XML, CSV, etc)", status: "PLANNED", year: 2026 },
      { title: "Acessibilidade digital", status: "PLANNED", year: 2026 },
      { title: "Mapeamento de dados LGPD", status: "PLANNED", year: 2026 },
      { title: "Melhoria do PDTIC", status: "IN_PROGRESS", year: 2026 }
    ];

    for (const goal of seedGoals) {
      const exists = await this.prisma.goal.findFirst({
        where: { title: goal.title, year: goal.year }
      });
      if (exists) continue;
      await this.prisma.goal.create({
        data: {
          title: goal.title,
          description: "Meta inicial criada automaticamente para acompanhamento estratégico.",
          year: goal.year,
          status: goal.status,
          priority: "MÉDIA",
          responsibleId: "planejamento"
        }
      });
    }
  }

  private async recalculateGoalStatus(goalId: string): Promise<void> {
    const currentGoal = await this.prisma.goal.findUnique({ where: { id: goalId }, select: { id: true, status: true } });
    if (!currentGoal) return;
    const actions = await this.prisma.goalAction.findMany({ where: { goalId }, select: { progress: true } });
    if (actions.length === 0) return;
    const progress = this.calculateProgress(actions.map((a) => a.progress));
    let status: GoalStatus = "PLANNED";
    if (progress >= 100) status = "COMPLETED";
    else if (progress > 0) status = "IN_PROGRESS";
    if (status === currentGoal.status) return;
    const updatedGoal = await this.prisma.goal.update({ where: { id: goalId }, data: { status } });
    await this.createAudit("Goal", goalId, "AUTO_STATUS_UPDATE", currentGoal, updatedGoal);
  }

  private calculateProgress(values: number[]): number {
    if (values.length === 0) return 0;
    return Number((values.reduce((acc, n) => acc + n, 0) / values.length).toFixed(2));
  }

  private async requireGoal(id: string): Promise<{ id: string }> {
    const goal = await this.prisma.goal.findUnique({ where: { id }, select: { id: true } });
    if (!goal) throw new NotFoundException("Meta não encontrada");
    return goal;
  }

  private async createAudit(entity: string, entityId: string, action: string, oldData: unknown, newData: unknown): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        entity,
        entityId,
        action,
        userId: "system",
        oldData: oldData ? (oldData as Prisma.InputJsonValue) : undefined,
        newData: newData ? (newData as Prisma.InputJsonValue) : undefined
      }
    });
  }
}
