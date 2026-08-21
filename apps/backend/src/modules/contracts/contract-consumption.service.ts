import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  ConsumptionActivityStatus,
  ConsumptionFinancialRule,
  ConsumptionMovementSource,
  ConsumptionMovementStatus,
  ContractPricingItemStatus,
  Prisma
} from "@prisma/client";
import { getAuditActorId } from "../../common/audit-actor";
import { PrismaService } from "../../prisma/prisma.service";

const APPROVED_STATUSES: ConsumptionMovementStatus[] = [
  ConsumptionMovementStatus.APPROVED,
  ConsumptionMovementStatus.ADJUSTED
];

const COMMITTED_STATUSES: ConsumptionMovementStatus[] = [
  ConsumptionMovementStatus.INFORMED,
  ConsumptionMovementStatus.UNDER_VALIDATION,
  ConsumptionMovementStatus.APPROVED,
  ConsumptionMovementStatus.ADJUSTED
];

export type CreateConsumptionMovementInput = {
  pricingItemId: string;
  /** Quantidade efetivamente consumida (pode ser 0 enquanto só houver estimativa). */
  quantity?: number;
  estimatedQuantity?: number;
  activityStatus?: string;
  executionDate: string;
  startDate?: string | null;
  description?: string | null;
  notes?: string | null;
  responsibleLabel?: string | null;
  responsibleUserId?: string | null;
  glpiTicketId?: number | null;
  source?: ConsumptionMovementSource;
  submitForValidation?: boolean;
  actorUserId?: string | null;
};

export type ValidateConsumptionMovementInput = {
  action: "approve" | "reject" | "adjust";
  quantity?: number;
  justification?: string | null;
  rejectionReason?: string | null;
  actorUserId?: string | null;
};

const OPEN_ACTIVITY: ConsumptionActivityStatus[] = [
  ConsumptionActivityStatus.SURVEY,
  ConsumptionActivityStatus.AWAITING_APPROVAL,
  ConsumptionActivityStatus.APPROVED_FOR_EXECUTION,
  ConsumptionActivityStatus.IN_DEVELOPMENT,
  ConsumptionActivityStatus.IN_VALIDATION,
  ConsumptionActivityStatus.SUSPENDED
];

@Injectable()
export class ContractConsumptionService {
  constructor(private readonly prisma: PrismaService) {}

  private async audit(entityId: string, action: string, before: unknown, after: unknown): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        entity: "ContractConsumptionMovement",
        entityId,
        action,
        userId: getAuditActorId(),
        oldData: before != null ? (before as Prisma.InputJsonValue) : undefined,
        newData: after != null ? (after as Prisma.InputJsonValue) : undefined
      }
    });
  }

  private serializeMovement(row: {
    id: string;
    contractId: string;
    pricingItemId: string;
    quantity: Prisma.Decimal;
    estimatedQuantity?: Prisma.Decimal;
    originalQuantity: Prisma.Decimal | null;
    unitCodeSnapshot: string | null;
    unitLabelSnapshot: string | null;
    status: ConsumptionMovementStatus;
    activityStatus?: ConsumptionActivityStatus;
    source: ConsumptionMovementSource;
    glpiTicketId: number | null;
    measurementId: string | null;
    measurementItemId: string | null;
    executionDate: Date;
    startDate?: Date | null;
    responsibleLabel: string | null;
    responsibleUserId: string | null;
    description: string | null;
    notes: string | null;
    rejectionReason: string | null;
    adjustmentJustification: string | null;
    createdById: string | null;
    validatedById: string | null;
    validatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    pricingItem?: {
      id: string;
      description: string;
      sequence: number;
      unit?: { code: string; label: string } | null;
      consumptionUnit?: { code: string; label: string } | null;
      type?: { code: string; label: string } | null;
    } | null;
    measurement?: {
      id: string;
      status: string;
      referenceMonth: number;
      referenceYear: number;
    } | null;
  }) {
    const unitSnap =
      row.unitCodeSnapshot && row.unitLabelSnapshot
        ? { code: row.unitCodeSnapshot, label: row.unitLabelSnapshot }
        : row.pricingItem?.consumptionUnit ?? row.pricingItem?.unit ?? null;
    let measurementBillingStatus: "NAO_MEDIDO" | "INCLUIDO_EM_MEDICAO" | "MEDIDO_APROVADO" =
      "NAO_MEDIDO";
    if (row.measurementId && row.measurement) {
      measurementBillingStatus =
        row.measurement.status === "APPROVED" ? "MEDIDO_APROVADO" : "INCLUIDO_EM_MEDICAO";
    } else if (row.measurementId) {
      measurementBillingStatus = "INCLUIDO_EM_MEDICAO";
    }
    return {
      ...row,
      quantity: row.quantity.toString(),
      estimatedQuantity: (row.estimatedQuantity ?? new Prisma.Decimal(0)).toString(),
      originalQuantity: row.originalQuantity?.toString() ?? null,
      activityStatus: row.activityStatus ?? ConsumptionActivityStatus.SURVEY,
      startDate: row.startDate ?? null,
      consumptionUnit: unitSnap,
      measurementBillingStatus,
      measurementLabel: row.measurement
        ? `${String(row.measurement.referenceMonth).padStart(2, "0")}/${row.measurement.referenceYear}`
        : null
    };
  }

  async summarize(contractId: string): Promise<unknown> {
    const items = await this.prisma.contractPricingItem.findMany({
      where: {
        contractId,
        status: ContractPricingItemStatus.ACTIVE,
        OR: [{ consumptionEnabled: true }, { billingKind: "ON_DEMAND" }]
      },
      include: { type: true, unit: true, consumptionUnit: true },
      orderBy: { sequence: "asc" }
    });

    const movements = await this.prisma.contractConsumptionMovement.groupBy({
      by: ["pricingItemId", "status"],
      where: { contractId },
      _sum: { quantity: true }
    });

    const openEstimated = await this.prisma.contractConsumptionMovement.groupBy({
      by: ["pricingItemId"],
      where: {
        contractId,
        activityStatus: { in: OPEN_ACTIVITY },
        status: { not: ConsumptionMovementStatus.REVERSED }
      },
      _sum: { estimatedQuantity: true }
    });

    const sumFor = (pricingItemId: string, statuses: ConsumptionMovementStatus[]) => {
      return movements
        .filter((m) => m.pricingItemId === pricingItemId && statuses.includes(m.status))
        .reduce((acc, m) => acc.add(m._sum.quantity ?? 0), new Prisma.Decimal(0));
    };

    return {
      items: items.map((item) => {
        const approvedUsed = sumFor(item.id, APPROVED_STATUSES);
        const pending = sumFor(item.id, [
          ConsumptionMovementStatus.INFORMED,
          ConsumptionMovementStatus.UNDER_VALIDATION
        ]);
        const estimatedOpen =
          openEstimated.find((e) => e.pricingItemId === item.id)?._sum.estimatedQuantity ??
          new Prisma.Decimal(0);
        const configurationPending =
          Boolean(item.consumptionEnabled) &&
          (!item.consumptionUnitId || item.consumptionAvailableQuantity == null);
        const availableBase =
          item.consumptionAvailableQuantity != null
            ? item.consumptionAvailableQuantity
            : configurationPending
              ? new Prisma.Decimal(0)
              : item.billingKind === "ON_DEMAND"
                ? item.quantity
                : new Prisma.Decimal(0);
        const available = availableBase.sub(approvedUsed);
        const projected = available.sub(estimatedOpen);
        const percent =
          availableBase.gt(0)
            ? approvedUsed.div(availableBase).mul(100).toDecimalPlaces(2).toNumber()
            : 0;
        const thresholds = Array.isArray(item.consumptionAlertThresholds)
          ? (item.consumptionAlertThresholds as number[])
          : [70, 80, 90, 100];
        const alertLevel = thresholds.filter((t) => percent >= Number(t)).pop() ?? null;
        const consumptionUnit = item.consumptionUnit ?? (configurationPending ? null : item.unit);

        return {
          id: item.id,
          sequence: item.sequence,
          description: item.description,
          unit: consumptionUnit,
          financialUnit: item.unit,
          type: item.type,
          billingKind: item.billingKind,
          financialRule: item.consumptionFinancialRule ?? ConsumptionFinancialRule.BALANCE_ONLY,
          availability: item.consumptionAvailability,
          accumulates: item.consumptionAccumulates,
          requiresValidation: item.consumptionRequiresValidation,
          configurationPending,
          quantityContracted: availableBase.toString(),
          quantityAvailableBase: availableBase.toString(),
          quantityApprovedUsed: approvedUsed.toString(),
          quantityPendingValidation: pending.toString(),
          quantityEstimatedOpen: estimatedOpen.toString(),
          quantityAvailable: available.toString(),
          quantityProjectedAvailable: projected.toString(),
          quantityCommittedAvailable: available.sub(pending).toString(),
          consumedPercent: percent,
          alertLevel,
          unitValue: item.unitValue.toString()
        };
      })
    };
  }

  async listMovements(
    contractId: string,
    query?: {
      pricingItemId?: string;
      glpiTicketId?: number;
      status?: string;
      page?: number;
      pageSize?: number;
    }
  ): Promise<unknown> {
    const page = Math.max(1, query?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query?.pageSize ?? 40));
    const where: Prisma.ContractConsumptionMovementWhereInput = {
      contractId,
      ...(query?.pricingItemId ? { pricingItemId: query.pricingItemId } : {}),
      ...(query?.glpiTicketId != null ? { glpiTicketId: query.glpiTicketId } : {}),
      ...(query?.status &&
      Object.values(ConsumptionMovementStatus).includes(query.status as ConsumptionMovementStatus)
        ? { status: query.status as ConsumptionMovementStatus }
        : {})
    };

    const [total, rows] = await Promise.all([
      this.prisma.contractConsumptionMovement.count({ where }),
      this.prisma.contractConsumptionMovement.findMany({
        where,
        include: {
          pricingItem: {
            select: {
              id: true,
              description: true,
              sequence: true,
              unit: { select: { code: true, label: true } },
              type: { select: { code: true, label: true } }
            }
          },
          measurement: { select: { id: true, status: true, referenceMonth: true, referenceYear: true } }
        },
        orderBy: [{ executionDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    return {
      items: rows.map((r) => this.serializeMovement(r)),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize))
    };
  }

  async createMovement(contractId: string, dto: CreateConsumptionMovementInput): Promise<unknown> {
    const effectiveQty = Number(dto.quantity ?? 0);
    const estimatedQty = Number(dto.estimatedQuantity ?? 0);
    if (!Number.isFinite(effectiveQty) || effectiveQty < 0) {
      throw new BadRequestException("Quantidade efetivamente consumida inválida.");
    }
    if (!Number.isFinite(estimatedQty) || estimatedQty < 0) {
      throw new BadRequestException("Quantidade estimada inválida.");
    }
    if (effectiveQty <= 0 && estimatedQty <= 0) {
      throw new BadRequestException("Informe a quantidade estimada e/ou a efetivamente consumida.");
    }
    const executionDate = new Date(dto.executionDate);
    if (Number.isNaN(executionDate.getTime())) {
      throw new BadRequestException("Data de execução inválida.");
    }
    const startDate =
      dto.startDate != null && String(dto.startDate).trim()
        ? new Date(dto.startDate)
        : null;
    if (startDate && Number.isNaN(startDate.getTime())) {
      throw new BadRequestException("Data de início inválida.");
    }

    const activityStatusRaw = dto.activityStatus?.trim();
    const activityStatus =
      activityStatusRaw &&
      Object.values(ConsumptionActivityStatus).includes(activityStatusRaw as ConsumptionActivityStatus)
        ? (activityStatusRaw as ConsumptionActivityStatus)
        : effectiveQty > 0
          ? ConsumptionActivityStatus.COMPLETED
          : ConsumptionActivityStatus.IN_DEVELOPMENT;

    const item = await this.prisma.contractPricingItem.findFirst({
      where: {
        id: dto.pricingItemId,
        contractId,
        status: ContractPricingItemStatus.ACTIVE
      },
      include: { unit: true, consumptionUnit: true, type: true }
    });
    if (!item) throw new NotFoundException("Item contratual de consumo não encontrado.");
    if (!item.consumptionEnabled && item.billingKind !== "ON_DEMAND") {
      throw new BadRequestException("Este item não está configurado para controle de consumo.");
    }
    if (item.consumptionEnabled && (!item.consumptionUnitId || item.consumptionAvailableQuantity == null)) {
      throw new BadRequestException(
        "Controle de consumo pendente de configuração: informe unidade e quantidade disponível no item contratual."
      );
    }

    const unitSnap = item.consumptionUnit ?? item.unit;

    if (effectiveQty > 0) {
      const summary = (await this.summarize(contractId)) as {
        items: Array<{ id: string; quantityCommittedAvailable: string; configurationPending?: boolean }>;
      };
      const balance = summary.items.find((i) => i.id === item.id);
      if (balance?.configurationPending) {
        throw new BadRequestException("Controle de consumo pendente de configuração no item.");
      }
      if (
        balance &&
        new Prisma.Decimal(effectiveQty).gt(new Prisma.Decimal(balance.quantityCommittedAvailable))
      ) {
        throw new BadRequestException("Quantidade efetiva excede o saldo disponível (considerando comprometido).");
      }
    }

    const requiresValidation = item.consumptionRequiresValidation && effectiveQty > 0;
    const status =
      effectiveQty <= 0
        ? ConsumptionMovementStatus.INFORMED
        : requiresValidation || dto.submitForValidation
          ? ConsumptionMovementStatus.UNDER_VALIDATION
          : ConsumptionMovementStatus.APPROVED;

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.contractConsumptionMovement.create({
        data: {
          contractId,
          pricingItemId: item.id,
          quantity: new Prisma.Decimal(effectiveQty),
          estimatedQuantity: new Prisma.Decimal(estimatedQty),
          originalQuantity: effectiveQty > 0 ? new Prisma.Decimal(effectiveQty) : null,
          unitCodeSnapshot: unitSnap.code,
          unitLabelSnapshot: unitSnap.label,
          status,
          activityStatus,
          source:
            dto.source ??
            (dto.glpiTicketId != null
              ? ConsumptionMovementSource.GLPI_TICKET
              : ConsumptionMovementSource.MANUAL),
          glpiTicketId: dto.glpiTicketId ?? null,
          executionDate,
          startDate,
          responsibleLabel: dto.responsibleLabel?.trim() || null,
          responsibleUserId: dto.responsibleUserId ?? null,
          description: dto.description?.trim() || null,
          notes: dto.notes?.trim() || null,
          createdById: dto.actorUserId ?? null,
          validatedById: status === ConsumptionMovementStatus.APPROVED ? dto.actorUserId ?? null : null,
          validatedAt: status === ConsumptionMovementStatus.APPROVED ? new Date() : null
        },
        include: {
          pricingItem: {
            select: {
              id: true,
              description: true,
              sequence: true,
              unit: { select: { code: true, label: true } },
              consumptionUnit: { select: { code: true, label: true } },
              type: { select: { code: true, label: true } }
            }
          }
        }
      });

      if (status === ConsumptionMovementStatus.APPROVED && effectiveQty > 0) {
        await tx.contractPricingItem.update({
          where: { id: item.id },
          data: { consumedQuantity: { increment: effectiveQty } }
        });
      }
      return row;
    });

    await this.audit(created.id, "CREATE", null, created);
    return this.serializeMovement(created);
  }

  async validateMovement(
    contractId: string,
    movementId: string,
    dto: ValidateConsumptionMovementInput
  ): Promise<unknown> {
    const row = await this.prisma.contractConsumptionMovement.findFirst({
      where: { id: movementId, contractId },
      include: { pricingItem: { include: { unit: true } } }
    });
    if (!row) throw new NotFoundException("Lançamento de consumo não encontrado.");
    if (
      row.status !== ConsumptionMovementStatus.UNDER_VALIDATION &&
      row.status !== ConsumptionMovementStatus.INFORMED
    ) {
      throw new BadRequestException("Somente lançamentos em validação podem ser decididos.");
    }
    if (row.measurementId) {
      throw new BadRequestException("Lançamento já vinculado a medição; use estorno/correção.");
    }

    let nextStatus: ConsumptionMovementStatus = ConsumptionMovementStatus.APPROVED;
    let nextQty = row.quantity;
    const original = row.originalQuantity ?? row.quantity;

    if (dto.action === "reject") {
      if (!dto.rejectionReason?.trim()) {
        throw new BadRequestException("Informe o motivo da rejeição.");
      }
      nextStatus = ConsumptionMovementStatus.REJECTED;
    } else if (dto.action === "adjust") {
      const qty = Number(dto.quantity);
      if (!Number.isFinite(qty) || qty < 0) {
        throw new BadRequestException("Informe a quantidade ajustada.");
      }
      if (!dto.justification?.trim()) {
        throw new BadRequestException("Informe a justificativa do ajuste.");
      }
      nextQty = new Prisma.Decimal(qty);
      nextStatus = ConsumptionMovementStatus.ADJUSTED;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.contractConsumptionMovement.update({
        where: { id: row.id },
        data: {
          status: nextStatus,
          quantity: nextQty,
          originalQuantity: original,
          rejectionReason: dto.rejectionReason?.trim() || null,
          adjustmentJustification: dto.justification?.trim() || null,
          validatedById: dto.actorUserId ?? null,
          validatedAt: new Date()
        },
        include: {
          pricingItem: {
            select: {
              id: true,
              description: true,
              sequence: true,
              unit: { select: { code: true, label: true } },
              type: { select: { code: true, label: true } }
            }
          }
        }
      });

      if (
        nextStatus === ConsumptionMovementStatus.APPROVED ||
        nextStatus === ConsumptionMovementStatus.ADJUSTED
      ) {
        await tx.contractPricingItem.update({
          where: { id: row.pricingItemId },
          data: { consumedQuantity: { increment: nextQty } }
        });
      }
      return next;
    });

    await this.audit(row.id, `VALIDATE_${dto.action.toUpperCase()}`, row, updated);
    return this.serializeMovement(updated);
  }

  async reverseMovement(
    contractId: string,
    movementId: string,
    dto: { justification?: string | null; actorUserId?: string | null }
  ): Promise<unknown> {
    const row = await this.prisma.contractConsumptionMovement.findFirst({
      where: { id: movementId, contractId }
    });
    if (!row) throw new NotFoundException("Lançamento de consumo não encontrado.");
    if (row.status === ConsumptionMovementStatus.REVERSED) {
      throw new BadRequestException("Lançamento já estornado.");
    }
    if (row.measurementId) {
      throw new BadRequestException(
        "Consumo já participou de medição. Utilize lançamento corretivo; exclusão definitiva não é permitida."
      );
    }
    if (!APPROVED_STATUSES.includes(row.status) && row.status !== ConsumptionMovementStatus.UNDER_VALIDATION) {
      throw new BadRequestException("Situação atual não permite estorno.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.contractConsumptionMovement.update({
        where: { id: row.id },
        data: {
          status: ConsumptionMovementStatus.REVERSED,
          notes: [row.notes, dto.justification?.trim()].filter(Boolean).join("\n") || row.notes,
          validatedById: dto.actorUserId ?? row.validatedById,
          validatedAt: new Date()
        },
        include: {
          pricingItem: {
            select: {
              id: true,
              description: true,
              sequence: true,
              unit: { select: { code: true, label: true } },
              type: { select: { code: true, label: true } }
            }
          }
        }
      });
      if (APPROVED_STATUSES.includes(row.status)) {
        await tx.contractPricingItem.update({
          where: { id: row.pricingItemId },
          data: { consumedQuantity: { decrement: row.quantity } }
        });
      }
      return next;
    });

    await this.audit(row.id, "REVERSE", row, updated);
    return this.serializeMovement(updated);
  }

  /** Consumos aprovados faturáveis ainda não vinculados a medição, na competência. */
  async listBillableForMeasurement(
    contractId: string,
    referenceMonth: number,
    referenceYear: number
  ): Promise<
    Array<{
      id: string;
      pricingItemId: string;
      quantity: Prisma.Decimal;
      financialRule: ConsumptionFinancialRule | null;
      unitValue: Prisma.Decimal;
      description: string;
      unitLabel: string | null;
      glpiTicketId: number | null;
      executionDate: Date;
    }>
  > {
    const start = new Date(Date.UTC(referenceYear, referenceMonth - 1, 1));
    const end = new Date(Date.UTC(referenceYear, referenceMonth, 0, 23, 59, 59, 999));
    const rows = await this.prisma.contractConsumptionMovement.findMany({
      where: {
        contractId,
        measurementId: null,
        status: { in: APPROVED_STATUSES },
        executionDate: { gte: start, lte: end }
      },
      include: {
        pricingItem: {
          select: {
            id: true,
            description: true,
            unitValue: true,
            consumptionFinancialRule: true,
            unit: { select: { label: true } }
          }
        }
      },
      orderBy: { executionDate: "asc" }
    });
    return rows.map((r) => ({
      id: r.id,
      pricingItemId: r.pricingItemId,
      quantity: r.quantity,
      financialRule: r.pricingItem.consumptionFinancialRule,
      unitValue: r.pricingItem.unitValue,
      description: r.pricingItem.description,
      unitLabel: r.pricingItem.unit?.label ?? r.unitLabelSnapshot,
      glpiTicketId: r.glpiTicketId,
      executionDate: r.executionDate
    }));
  }

  async linkMovementsToMeasurement(
    movementIds: string[],
    measurementId: string,
    measurementItemId: string | null
  ): Promise<void> {
    if (movementIds.length === 0) return;
    await this.prisma.contractConsumptionMovement.updateMany({
      where: { id: { in: movementIds }, measurementId: null },
      data: { measurementId, measurementItemId }
    });
  }

  async unlinkMovementsFromMeasurement(measurementId: string): Promise<void> {
    await this.prisma.contractConsumptionMovement.updateMany({
      where: { measurementId },
      data: { measurementId: null, measurementItemId: null }
    });
  }
}
