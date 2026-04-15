import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { GovernancePriority, GovernanceType, Prisma, TicketEventType, TicketGovernanceStatus, TicketWatcherRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  AcknowledgeTicketDto,
  AddWatcherDto,
  ClassifyTicketDto,
  CreateTicketGovernanceDto,
  ExtendDeadlineDto,
  NotifyManagerDto,
  SendToControladoriaDto,
  SetResolvedDto
} from "./governance-tickets.dto";

@Injectable()
export class GovernanceTicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTicketGovernanceDto): Promise<unknown> {
    const created = await this.prisma.ticketGovernance.create({
      data: {
        ticketId: dto.ticketId,
        contractId: dto.contractId,
        openedAt: dto.openedAt ? new Date(dto.openedAt) : new Date()
      }
    });
    await this.createEvent(created.id, "OPENED", "Chamado criado na governança.");
    await this.createAudit("TicketGovernance", created.id, "CREATE", null, created);
    return this.findOne(created.id);
  }

  async findAll(): Promise<unknown> {
    return this.prisma.ticketGovernance.findMany({
      include: {
        contract: { select: { id: true, number: true, name: true } },
        watchers: true
      },
      orderBy: { openedAt: "desc" }
    });
  }

  async findOne(id: string): Promise<unknown> {
    const item = await this.prisma.ticketGovernance.findUnique({
      where: { id },
      include: {
        contract: { select: { id: true, number: true, name: true } },
        deadlineExtensions: { orderBy: { createdAt: "desc" } },
        eventLogs: { orderBy: { createdAt: "asc" } },
        watchers: true
      }
    });
    if (!item) throw new NotFoundException("Chamado de governança não encontrado");
    return item;
  }

  async acknowledge(id: string, dto: AcknowledgeTicketDto): Promise<unknown> {
    const current = await this.requireTicket(id);
    const updated = await this.prisma.ticketGovernance.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(dto.acknowledgedAt),
        status: current.status === "OPEN" ? "ACKNOWLEDGED" : current.status
      }
    });
    await this.createEvent(id, "ACKNOWLEDGED", "Ciência registrada pela empresa.");
    await this.createAudit("TicketGovernance", id, "ACKNOWLEDGE", current, updated);
    return this.findOne(id);
  }

  async classify(id: string, dto: ClassifyTicketDto): Promise<unknown> {
    const current = await this.requireTicket(id);
    if (!current.acknowledgedAt) {
      throw new BadRequestException("É obrigatório registrar a ciência antes de classificar");
    }
    const slaDeadline =
      dto.type === "CORRETIVA" ? this.calculateSlaDeadline(current.openedAt, dto.priority) : current.slaDeadline;
    const updated = await this.prisma.ticketGovernance.update({
      where: { id },
      data: {
        priority: dto.priority,
        type: dto.type,
        slaDeadline,
        status: "IN_PROGRESS"
      }
    });
    await this.createAudit("TicketGovernance", id, "CLASSIFY", current, updated);
    return this.findOne(id);
  }

  async setResolved(id: string, dto: SetResolvedDto): Promise<unknown> {
    const current = await this.requireTicket(id);
    const updated = await this.prisma.ticketGovernance.update({
      where: { id },
      data: { resolvedAt: new Date(dto.resolvedAt), status: "IN_PROGRESS" }
    });
    await this.createAudit("TicketGovernance", id, "RESOLVE", current, updated);
    return this.findOne(id);
  }

  async notifyManager(id: string, dto: NotifyManagerDto): Promise<unknown> {
    const current = await this.requireTicket(id);
    const updated = await this.prisma.ticketGovernance.update({
      where: { id },
      data: { managerNotified: dto.managerNotified }
    });
    await this.createEvent(id, "MANAGER_NOTIFIED", dto.description);
    await this.createAudit("TicketGovernance", id, "MANAGER_NOTIFY", current, updated);
    return this.findOne(id);
  }

  async extendDeadline(id: string, dto: ExtendDeadlineDto): Promise<unknown> {
    const current = await this.requireTicket(id);
    if (!current.slaDeadline) throw new BadRequestException("Prazo SLA não definido");
    const newDeadline = new Date(dto.newDeadline);
    if (newDeadline <= current.slaDeadline) {
      throw new BadRequestException("Novo prazo deve ser maior que o prazo anterior");
    }

    const extension = await this.prisma.ticketDeadlineExtension.create({
      data: {
        ticketGovernanceId: id,
        previousDeadline: current.slaDeadline,
        newDeadline,
        justification: dto.justification,
        createdBy: dto.createdBy
      }
    });
    await this.createAudit("TicketDeadlineExtension", extension.id, "CREATE", null, extension);

    const updated = await this.prisma.ticketGovernance.update({
      where: { id },
      data: { slaDeadline: newDeadline, status: "EXTENDED_DEADLINE" }
    });
    await this.createEvent(id, "DEADLINE_EXTENDED", "Prazo estendido pelo gestor.");
    await this.createAudit("TicketGovernance", id, "EXTEND_DEADLINE", current, updated);
    return this.findOne(id);
  }

  async addWatcher(id: string, dto: AddWatcherDto): Promise<unknown> {
    await this.requireTicket(id);
    const watcher = await this.prisma.ticketWatcher.upsert({
      where: { ticketGovernanceId_userId_role: { ticketGovernanceId: id, userId: dto.userId, role: dto.role } },
      create: { ticketGovernanceId: id, userId: dto.userId, role: dto.role },
      update: {}
    });
    await this.createAudit("TicketWatcher", watcher.id, "CREATE", null, watcher);
    return watcher;
  }

  async sendToControladoria(id: string, dto: SendToControladoriaDto): Promise<unknown> {
    const current = await this.requireTicket(id);
    if (!dto.seiProcessNumber.trim()) throw new BadRequestException("Número do processo SEI é obrigatório");
    const controladoriaUserId = dto.controladoriaUserId?.trim() || "controladoria";
    const controlWatcher = await this.prisma.ticketWatcher.upsert({
      where: {
        ticketGovernanceId_userId_role: {
          ticketGovernanceId: id,
          userId: controladoriaUserId,
          role: TicketWatcherRole.CONTROLADORIA
        }
      },
      create: { ticketGovernanceId: id, userId: controladoriaUserId, role: TicketWatcherRole.CONTROLADORIA },
      update: {}
    });
    await this.createAudit("TicketWatcher", controlWatcher.id, "UPSERT", null, controlWatcher);
    const updated = await this.prisma.ticketGovernance.update({
      where: { id },
      data: {
        status: "SENT_TO_CONTROLADORIA",
        controladoriaNotified: true,
        seiProcessNumber: dto.seiProcessNumber
      }
    });
    await this.createEvent(id, "SENT_TO_CONTROLADORIA", "Chamado enviado para controladoria.");
    await this.createAudit("TicketGovernance", id, "SEND_TO_CONTROLADORIA", current, updated);
    return this.findOne(id);
  }

  async runMonitoring(): Promise<unknown> {
    const now = new Date();
    const candidates = await this.prisma.ticketGovernance.findMany({
      where: {
        resolvedAt: null,
        slaDeadline: { not: null }
      },
      include: { deadlineExtensions: { orderBy: { createdAt: "desc" }, take: 1 } }
    });

    let slaViolated = 0;
    let escalated = 0;
    for (const item of candidates) {
      if (!item.slaDeadline || item.slaDeadline >= now) continue;
      if (item.status === TicketGovernanceStatus.EXTENDED_DEADLINE) {
        const previous = {
          status: item.status,
          controladoriaNotified: item.controladoriaNotified
        };
        const updated = await this.prisma.ticketGovernance.update({
          where: { id: item.id },
          data: { status: TicketGovernanceStatus.ESCALATED, controladoriaNotified: true }
        });
        await this.createEvent(item.id, "ESCALATED", "Prazo estendido descumprido; escalonamento automático.");
        await this.createAudit("TicketGovernance", item.id, "AUTO_ESCALATE", previous, updated);
        escalated += 1;
      } else if (item.status !== TicketGovernanceStatus.SENT_TO_CONTROLADORIA) {
        const previous = {
          status: item.status,
          managerNotified: item.managerNotified
        };
        const updated = await this.prisma.ticketGovernance.update({
          where: { id: item.id },
          data: { status: TicketGovernanceStatus.SLA_VIOLATED, managerNotified: true }
        });
        await this.createEvent(item.id, "SLA_VIOLATED", "SLA violado automaticamente.");
        await this.createAudit("TicketGovernance", item.id, "AUTO_SLA_VIOLATION", previous, updated);
        slaViolated += 1;
      }
    }

    return { checked: candidates.length, slaViolated, escalated };
  }

  async notifications(): Promise<unknown> {
    const now = new Date();
    const near = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const [nearDeadline, violated, controladoria] = await Promise.all([
      this.prisma.ticketGovernance.count({
        where: { resolvedAt: null, slaDeadline: { gte: now, lte: near }, status: { in: ["IN_PROGRESS", "ACKNOWLEDGED"] } }
      }),
      this.prisma.ticketGovernance.count({ where: { status: "SLA_VIOLATED", resolvedAt: null } }),
      this.prisma.ticketGovernance.count({ where: { status: "SENT_TO_CONTROLADORIA", resolvedAt: null } })
    ]);
    return {
      unread: nearDeadline + violated + controladoria,
      items: [
        { type: "SLA_PROXIMO", total: nearDeadline },
        { type: "SLA_VIOLADO", total: violated },
        { type: "CONTROLADORIA", total: controladoria }
      ]
    };
  }

  private calculateSlaDeadline(openedAt: Date, priority: GovernancePriority): Date {
    const hoursByPriority: Record<GovernancePriority, number> = {
      LOW: 72,
      MEDIUM: 48,
      HIGH: 24,
      CRITICAL: 4
    };
    return new Date(openedAt.getTime() + hoursByPriority[priority] * 60 * 60 * 1000);
  }

  private async requireTicket(id: string): Promise<{
    id: string;
    openedAt: Date;
    acknowledgedAt: Date | null;
    type: GovernanceType | null;
    status: TicketGovernanceStatus;
    slaDeadline: Date | null;
  }> {
    const item = await this.prisma.ticketGovernance.findUnique({
      where: { id },
      select: { id: true, openedAt: true, acknowledgedAt: true, type: true, status: true, slaDeadline: true }
    });
    if (!item) throw new NotFoundException("Chamado de governança não encontrado");
    return item;
  }

  private async createEvent(ticketGovernanceId: string, type: TicketEventType, description: string): Promise<void> {
    await this.prisma.ticketEventLog.create({
      data: { ticketGovernanceId, type, description }
    });
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
