import { Injectable } from "@nestjs/common";
import {
  ContractItemCriticality,
  ContractItemDeliveryStatus,
  ContractOccurrenceStatus,
  ContractScheduleMilestoneStatus,
  ContractScheduleStatus,
  ContractStatus,
  DeadlineAttentionLevel,
  DeadlineOrigin,
  DeadlineStatus,
  MeasurementStatus,
  Prisma,
  type Deadline
} from "@prisma/client";
import { requestActorStore } from "../../common/audit-actor";
import { PrismaService } from "../../prisma/prisma.service";
import {
  attentionFromStatus,
  buildSyncKey,
  computeDeadlineStatus,
  endOfUtcMonth,
  isOpenDeadlineStatus
} from "./deadline-status";

type DesiredDeadline = {
  syncKey: string;
  origin: DeadlineOrigin;
  contractId: string | null;
  title: string;
  description: string | null;
  responsibleUserId: string | null;
  dueAt: Date;
  expectedAction: string | null;
  sourceEntityType: string;
  sourceEntityId: string;
  attentionHint?: DeadlineAttentionLevel;
  criticality?: ContractItemCriticality | null;
};

export type DeadlineListFilters = {
  origin?: string;
  status?: string;
  attentionLevel?: string;
  contractId?: string;
  responsibleUserId?: string;
  q?: string;
  includeCancelled?: boolean;
};

const CLOSED_OCCURRENCE: ContractOccurrenceStatus[] = [
  ContractOccurrenceStatus.CONCLUIDA,
  ContractOccurrenceStatus.ARQUIVADA,
  ContractOccurrenceStatus.REGULARIZADA
];

const CLOSED_MILESTONE: ContractScheduleMilestoneStatus[] = [
  ContractScheduleMilestoneStatus.CONCLUIDA,
  ContractScheduleMilestoneStatus.CANCELADA
];

const CLOSED_SCHEDULE: ContractScheduleStatus[] = [
  ContractScheduleStatus.CONCLUIDO,
  ContractScheduleStatus.CANCELADO,
  ContractScheduleStatus.SUBSTITUIDO
];

@Injectable()
export class DeadlinesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: DeadlineListFilters = {}): Promise<{
    items: unknown[];
    summary: {
      totalOpen: number;
      byStatus: Record<string, number>;
      byOrigin: Record<string, number>;
      byAttention: Record<string, number>;
    };
  }> {
    // Primeira carga: materializa se ainda não houver prazos geridos pelo sync.
    const managedCount = await this.prisma.deadline.count({ where: { syncManaged: true } });
    if (managedCount === 0) {
      await this.syncDeadlines();
    }

    const where: Prisma.DeadlineWhereInput = {
      ...this.organizationScope()
    };

    if (filters.origin && Object.values(DeadlineOrigin).includes(filters.origin as DeadlineOrigin)) {
      where.origin = filters.origin as DeadlineOrigin;
    }
    if (filters.status && Object.values(DeadlineStatus).includes(filters.status as DeadlineStatus)) {
      where.status = filters.status as DeadlineStatus;
    } else if (!filters.includeCancelled) {
      where.status = { not: DeadlineStatus.CANCELLED };
    }
    if (
      filters.attentionLevel &&
      Object.values(DeadlineAttentionLevel).includes(filters.attentionLevel as DeadlineAttentionLevel)
    ) {
      where.attentionLevel = filters.attentionLevel as DeadlineAttentionLevel;
    }
    if (filters.contractId) where.contractId = filters.contractId;
    if (filters.responsibleUserId) where.responsibleUserId = filters.responsibleUserId;
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { expectedAction: { contains: q, mode: "insensitive" } },
        { contract: { is: { number: { contains: q, mode: "insensitive" } } } },
        { contract: { is: { name: { contains: q, mode: "insensitive" } } } },
        { contract: { is: { internalCode: { contains: q, mode: "insensitive" } } } }
      ];
    }

    const items = await this.prisma.deadline.findMany({
      where,
      include: {
        contract: {
          select: {
            id: true,
            number: true,
            name: true,
            internalCode: true,
            formalNumber: true,
            organizationId: true
          }
        },
        responsible: {
          select: {
            id: true,
            email: true,
            displayName: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: [{ dueAt: "asc" }, { attentionLevel: "desc" }]
    });

    const summaryWhere = {
      ...this.organizationScope(),
      status: { not: DeadlineStatus.CANCELLED }
    };
    const [byStatusRows, byOriginRows, byAttentionRows] = await Promise.all([
      this.prisma.deadline.groupBy({
        by: ["status"],
        where: summaryWhere,
        _count: { _all: true }
      }),
      this.prisma.deadline.groupBy({
        by: ["origin"],
        where: summaryWhere,
        _count: { _all: true }
      }),
      this.prisma.deadline.groupBy({
        by: ["attentionLevel"],
        where: summaryWhere,
        _count: { _all: true }
      })
    ]);

    const byStatus: Record<string, number> = {};
    const byOrigin: Record<string, number> = {};
    const byAttention: Record<string, number> = {};
    let totalOpen = 0;
    for (const row of byStatusRows) {
      byStatus[row.status] = row._count._all;
      if (isOpenDeadlineStatus(row.status)) totalOpen += row._count._all;
    }
    for (const row of byOriginRows) {
      byOrigin[row.origin] = row._count._all;
    }
    for (const row of byAttentionRows) {
      byAttention[row.attentionLevel] = row._count._all;
    }

    return {
      items: items.map((d) => this.serialize(d)),
      summary: { totalOpen, byStatus, byOrigin, byAttention }
    };
  }

  /**
   * Materializa prazos a partir de contratos, cronogramas, ocorrências, medições e funcionalidades.
   * Não envia e-mail nesta onda.
   */
  async syncDeadlines(): Promise<{
    upserted: number;
    cancelled: number;
    desired: number;
  }> {
    const now = new Date();
    const desired = await this.collectDesired(now);
    const desiredKeys = new Set(desired.map((d) => d.syncKey));

    const existingRows =
      desired.length === 0
        ? []
        : await this.prisma.deadline.findMany({
            where: { syncKey: { in: desired.map((d) => d.syncKey) } }
          });
    const existingByKey = new Map(existingRows.map((row) => [row.syncKey, row]));

    let upserted = 0;
    const UPSERT_CHUNK = 25;
    for (let i = 0; i < desired.length; i += UPSERT_CHUNK) {
      const chunk = desired.slice(i, i + UPSERT_CHUNK);
      const results = await Promise.all(
        chunk.map(async (row) => {
          const openStatus = computeDeadlineStatus(row.dueAt, now);
          const attention =
            row.attentionHint ?? attentionFromStatus(openStatus, row.origin, row.criticality ?? null);
          const existing = existingByKey.get(row.syncKey);

          if (existing && !isOpenDeadlineStatus(existing.status) && existing.status !== DeadlineStatus.CANCELLED) {
            if (existing.syncManaged) {
              await this.prisma.deadline.update({
                where: { id: existing.id },
                data: {
                  title: row.title,
                  description: row.description,
                  dueAt: row.dueAt,
                  expectedAction: row.expectedAction,
                  contractId: row.contractId,
                  responsibleUserId: row.responsibleUserId
                }
              });
              return 1;
            }
            return 0;
          }

          await this.prisma.deadline.upsert({
            where: { syncKey: row.syncKey },
            create: {
              origin: row.origin,
              contractId: row.contractId,
              title: row.title,
              description: row.description,
              responsibleUserId: row.responsibleUserId,
              dueAt: row.dueAt,
              status: openStatus,
              attentionLevel: attention,
              expectedAction: row.expectedAction,
              sourceEntityType: row.sourceEntityType,
              sourceEntityId: row.sourceEntityId,
              syncKey: row.syncKey,
              syncManaged: true
            },
            update: {
              origin: row.origin,
              contractId: row.contractId,
              title: row.title,
              description: row.description,
              responsibleUserId: row.responsibleUserId,
              dueAt: row.dueAt,
              status: openStatus,
              attentionLevel: attention,
              expectedAction: row.expectedAction,
              sourceEntityType: row.sourceEntityType,
              sourceEntityId: row.sourceEntityId,
              syncManaged: true,
              completedAt: null
            }
          });
          return 1;
        })
      );
      upserted += results.reduce<number>((acc, n) => acc + n, 0);
    }

    const stale = await this.prisma.deadline.findMany({
      where: {
        syncManaged: true,
        status: { in: [DeadlineStatus.FUTURE, DeadlineStatus.NEAR_DUE, DeadlineStatus.DUE_TODAY, DeadlineStatus.OVERDUE] },
        syncKey: { notIn: [...desiredKeys] }
      },
      select: { id: true, dueAt: true, completedAt: true }
    });

    let cancelled = 0;
    if (stale.length > 0) {
      // Fontes resolvidas / não aplicáveis: cancelar prazos abertos geridos pelo sync.
      const result = await this.prisma.deadline.updateMany({
        where: { id: { in: stale.map((s) => s.id) } },
        data: { status: DeadlineStatus.CANCELLED, completedAt: now }
      });
      cancelled = result.count;
    }

    return { upserted, cancelled, desired: desired.length };
  }

  /** Alias administrativo do sync. */
  async recalculate(): Promise<{ upserted: number; cancelled: number; desired: number }> {
    return this.syncDeadlines();
  }

  private async collectDesired(now: Date): Promise<DesiredDeadline[]> {
    const out: DesiredDeadline[] = [];
    out.push(...(await this.fromContractEnds()));
    out.push(...(await this.fromScheduleMilestones()));
    out.push(...(await this.fromOccurrences()));
    out.push(...(await this.fromPendingMeasurements(now)));
    out.push(...(await this.fromPendingFeatures()));
    return out;
  }

  private async fromContractEnds(): Promise<DesiredDeadline[]> {
    const contracts = await this.prisma.contract.findMany({
      where: { deletedAt: null, status: ContractStatus.ACTIVE },
      select: {
        id: true,
        number: true,
        name: true,
        endDate: true,
        fiscal: { select: { userId: true } },
        manager: { select: { userId: true } }
      }
    });

    return contracts.map((c) => {
      const responsibleUserId = c.manager.userId ?? c.fiscal.userId ?? null;
      return {
        syncKey: buildSyncKey(DeadlineOrigin.CONTRACT_END, "Contract", c.id, responsibleUserId),
        origin: DeadlineOrigin.CONTRACT_END,
        contractId: c.id,
        title: `Fim de vigência · ${c.number}`,
        description: `O contrato «${c.name}» tem vigência até a data indicada.`,
        responsibleUserId,
        dueAt: c.endDate,
        expectedAction: "Avaliar renovação, prorrogação ou encerramento",
        sourceEntityType: "Contract",
        sourceEntityId: c.id
      };
    });
  }

  private async fromScheduleMilestones(): Promise<DesiredDeadline[]> {
    const milestones = await this.prisma.contractScheduleMilestone.findMany({
      where: {
        plannedEndDate: { not: null },
        status: { notIn: CLOSED_MILESTONE },
        schedule: { status: { notIn: CLOSED_SCHEDULE }, contract: { deletedAt: null } }
      },
      select: {
        id: true,
        activity: true,
        plannedEndDate: true,
        sequence: true,
        scheduleId: true,
        schedule: {
          select: {
            id: true,
            name: true,
            contractId: true,
            responsibles: { select: { userId: true } }
          }
        },
        responsibles: { select: { userId: true } }
      }
    });

    const rows: DesiredDeadline[] = [];
    for (const m of milestones) {
      if (!m.plannedEndDate) continue;
      const userIds = new Set<string>();
      for (const r of m.responsibles) userIds.add(r.userId);
      if (userIds.size === 0) {
        for (const r of m.schedule.responsibles) userIds.add(r.userId);
      }
      const recipients = userIds.size > 0 ? [...userIds] : [null];
      for (const userId of recipients) {
        rows.push({
          syncKey: buildSyncKey(DeadlineOrigin.SCHEDULE_STEP, "ContractScheduleMilestone", m.id, userId),
          origin: DeadlineOrigin.SCHEDULE_STEP,
          contractId: m.schedule.contractId,
          title: `Marco · ${m.activity}`,
          description: `Etapa ${m.sequence} do cronograma «${m.schedule.name}».`,
          responsibleUserId: userId,
          dueAt: m.plannedEndDate,
          expectedAction: "Atualizar progresso ou concluir o marco",
          sourceEntityType: "ContractScheduleMilestone",
          sourceEntityId: m.id
        });
      }
    }
    return rows;
  }

  private async fromOccurrences(): Promise<DesiredDeadline[]> {
    try {
      const occurrences = await this.prisma.contractOccurrence.findMany({
        where: {
          regularizationDeadline: { not: null },
          status: { notIn: CLOSED_OCCURRENCE },
          contract: { deletedAt: null }
        },
        select: {
          id: true,
          title: true,
          contractId: true,
          regularizationDeadline: true,
          severity: true,
          internalResponsibleUserId: true
        }
      });

      return occurrences
        .filter((o) => o.regularizationDeadline != null)
        .map((o) => ({
          syncKey: buildSyncKey(
            DeadlineOrigin.OCCURRENCE,
            "ContractOccurrence",
            o.id,
            o.internalResponsibleUserId
          ),
          origin: DeadlineOrigin.OCCURRENCE,
          contractId: o.contractId,
          title: `Ocorrência · ${o.title}`,
          description: "Prazo de regularização da ocorrência contratual.",
          responsibleUserId: o.internalResponsibleUserId,
          dueAt: o.regularizationDeadline as Date,
          expectedAction: "Regularizar a ocorrência ou atualizar a situação",
          sourceEntityType: "ContractOccurrence",
          sourceEntityId: o.id,
          criticality:
            o.severity === "CRITICA"
              ? ContractItemCriticality.CRITICA
              : o.severity === "ALTA"
                ? ContractItemCriticality.ALTA
                : o.severity === "BAIXA"
                  ? ContractItemCriticality.BAIXA
                  : ContractItemCriticality.MEDIA
        }));
    } catch {
      // Schema/migration de ocorrência ausente em ambientes legados.
      return [];
    }
  }

  private async fromPendingMeasurements(now: Date): Promise<DesiredDeadline[]> {
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    const dueAt = endOfUtcMonth(year, month);

    const measurements = await this.prisma.measurement.findMany({
      where: {
        deletedAt: null,
        referenceMonth: month,
        referenceYear: year,
        status: { in: [MeasurementStatus.OPEN, MeasurementStatus.UNDER_REVIEW] },
        contract: { deletedAt: null }
      },
      select: {
        id: true,
        referenceMonth: true,
        referenceYear: true,
        contractId: true,
        contract: {
          select: {
            number: true,
            name: true,
            fiscal: { select: { userId: true } },
            manager: { select: { userId: true } }
          }
        }
      }
    });

    return measurements.map((m) => {
      const responsibleUserId = m.contract.manager.userId ?? m.contract.fiscal.userId ?? null;
      const ref = `${String(m.referenceMonth).padStart(2, "0")}/${m.referenceYear}`;
      return {
        syncKey: buildSyncKey(DeadlineOrigin.MEASUREMENT_PENDING, "Measurement", m.id, responsibleUserId),
        origin: DeadlineOrigin.MEASUREMENT_PENDING,
        contractId: m.contractId,
        title: `Medição pendente · ${ref}`,
        description: `Medição do contrato ${m.contract.number} («${m.contract.name}») ainda não aprovada.`,
        responsibleUserId,
        dueAt,
        expectedAction: "Revisar e aprovar a medição do mês",
        sourceEntityType: "Measurement",
        sourceEntityId: m.id
      };
    });
  }

  /**
   * Ticket 58: funcionalidades não entregues/parciais com grupo.
   * - Um prazo por (feature × membro do grupo ∪ responsável específico)
   * - Um prazo consolidado por módulo para cada acompanhador (fiscal do módulo)
   */
  private async fromPendingFeatures(): Promise<DesiredDeadline[]> {
    const features = await this.prisma.contractFeature.findMany({
      where: {
        deliveryStatus: {
          in: [ContractItemDeliveryStatus.NOT_DELIVERED, ContractItemDeliveryStatus.PARTIALLY_DELIVERED]
        },
        validationGroupId: { not: null },
        module: { contract: { deletedAt: null, status: ContractStatus.ACTIVE } }
      },
      select: {
        id: true,
        name: true,
        itemCode: true,
        criticality: true,
        deliveryStatus: true,
        validationGroupId: true,
        moduleId: true,
        module: {
          select: {
            id: true,
            name: true,
            contractId: true,
            contract: { select: { number: true, endDate: true } },
            fiscals: { select: { userId: true } },
            validatorId: true
          }
        },
        validationGroup: {
          select: {
            id: true,
            name: true,
            active: true,
            members: { select: { userId: true } }
          }
        },
        responsibles: { select: { userId: true } },
        scheduleMilestones: {
          where: {
            plannedEndDate: { not: null },
            status: { notIn: CLOSED_MILESTONE }
          },
          select: { plannedEndDate: true },
          orderBy: { plannedEndDate: "asc" },
          take: 1
        }
      }
    });

    const rows: DesiredDeadline[] = [];
    type ModuleBucket = {
      moduleId: string;
      moduleName: string;
      contractId: string;
      contractNumber: string;
      dueAt: Date;
      featureNames: string[];
      companionIds: Set<string>;
      maxCriticality: ContractItemCriticality;
    };

    const modulePending = new Map<string, ModuleBucket>();

    const critRank: Record<ContractItemCriticality, number> = {
      APOIO: 0,
      BAIXA: 1,
      MEDIA: 2,
      ALTA: 3,
      CRITICA: 4,
      NAO_SE_APLICA: -1
    };

    for (const f of features) {
      if (!f.validationGroup || !f.validationGroup.active) continue;

      const dueAt =
        f.scheduleMilestones[0]?.plannedEndDate ??
        f.module.contract.endDate ??
        endOfUtcMonth(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1);

      const recipientIds = new Set<string>();
      for (const m of f.validationGroup.members) recipientIds.add(m.userId);
      for (const r of f.responsibles) recipientIds.add(r.userId);

      const deliveryLabel =
        f.deliveryStatus === ContractItemDeliveryStatus.PARTIALLY_DELIVERED ? "entrega parcial" : "não entregue";
      const codePrefix = f.itemCode ? `${f.itemCode} · ` : "";

      for (const userId of recipientIds) {
        rows.push({
          syncKey: buildSyncKey(DeadlineOrigin.FEATURE_VALIDATION, "ContractFeature", f.id, userId),
          origin: DeadlineOrigin.FEATURE_VALIDATION,
          contractId: f.module.contractId,
          title: `Validar · ${codePrefix}${f.name}`,
          description: `Funcionalidade ${deliveryLabel} no módulo «${f.module.name}» (grupo «${f.validationGroup.name}»).`,
          responsibleUserId: userId,
          dueAt,
          expectedAction: "Validar entrega ou atualizar o status da funcionalidade",
          sourceEntityType: "ContractFeature",
          sourceEntityId: f.id,
          criticality: f.criticality
        });
      }

      // Consolida para acompanhadores do módulo
      let bucket = modulePending.get(f.moduleId);
      if (!bucket) {
        const companions = new Set<string>();
        for (const link of f.module.fiscals) companions.add(link.userId);
        if (f.module.validatorId) companions.add(f.module.validatorId);
        bucket = {
          moduleId: f.moduleId,
          moduleName: f.module.name,
          contractId: f.module.contractId,
          contractNumber: f.module.contract.number,
          dueAt,
          featureNames: [],
          companionIds: companions,
          maxCriticality: f.criticality
        };
        modulePending.set(f.moduleId, bucket);
      }
      bucket.featureNames.push(f.name);
      if (dueAt.getTime() < bucket.dueAt.getTime()) bucket.dueAt = dueAt;
      if (critRank[f.criticality] > critRank[bucket.maxCriticality]) {
        bucket.maxCriticality = f.criticality;
      }
    }

    for (const bucket of modulePending.values()) {
      if (bucket.companionIds.size === 0) {
        rows.push({
          syncKey: buildSyncKey(
            DeadlineOrigin.FEATURE_VALIDATION,
            "ContractModule",
            bucket.moduleId,
            null,
            "companion"
          ),
          origin: DeadlineOrigin.FEATURE_VALIDATION,
          contractId: bucket.contractId,
          title: `Acompanhamento · módulo «${bucket.moduleName}»`,
          description: `${bucket.featureNames.length} funcionalidade(s) pendente(s) no contrato ${bucket.contractNumber}: ${bucket.featureNames.slice(0, 8).join("; ")}${bucket.featureNames.length > 8 ? "…" : ""}.`,
          responsibleUserId: null,
          dueAt: bucket.dueAt,
          expectedAction: "Acompanhar a entrega das funcionalidades do módulo",
          sourceEntityType: "ContractModule",
          sourceEntityId: bucket.moduleId,
          criticality: bucket.maxCriticality
        });
        continue;
      }
      for (const userId of bucket.companionIds) {
        rows.push({
          syncKey: buildSyncKey(
            DeadlineOrigin.FEATURE_VALIDATION,
            "ContractModule",
            bucket.moduleId,
            userId,
            "companion"
          ),
          origin: DeadlineOrigin.FEATURE_VALIDATION,
          contractId: bucket.contractId,
          title: `Acompanhamento · módulo «${bucket.moduleName}»`,
          description: `${bucket.featureNames.length} funcionalidade(s) pendente(s) no contrato ${bucket.contractNumber}: ${bucket.featureNames.slice(0, 8).join("; ")}${bucket.featureNames.length > 8 ? "…" : ""}.`,
          responsibleUserId: userId,
          dueAt: bucket.dueAt,
          expectedAction: "Acompanhar a entrega das funcionalidades do módulo",
          sourceEntityType: "ContractModule",
          sourceEntityId: bucket.moduleId,
          criticality: bucket.maxCriticality
        });
      }
    }

    return rows;
  }

  private serialize(
    d: Deadline & {
      contract: {
        id: string;
        number: string;
        name: string;
        internalCode: string | null;
        formalNumber: string | null;
        organizationId: string | null;
      } | null;
      responsible: {
        id: string;
        email: string;
        displayName: string | null;
        firstName: string | null;
        lastName: string | null;
      } | null;
    }
  ): unknown {
    const responsibleLabel = d.responsible
      ? d.responsible.displayName ||
        [d.responsible.firstName, d.responsible.lastName].filter(Boolean).join(" ") ||
        d.responsible.email
      : null;

    return {
      id: d.id,
      origin: d.origin,
      contractId: d.contractId,
      title: d.title,
      description: d.description,
      responsibleUserId: d.responsibleUserId,
      responsibleLabel,
      dueAt: d.dueAt,
      status: d.status,
      attentionLevel: d.attentionLevel,
      expectedAction: d.expectedAction,
      sourceEntityType: d.sourceEntityType,
      sourceEntityId: d.sourceEntityId,
      completedAt: d.completedAt,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      contract: d.contract,
      href: this.hrefFor(d.sourceEntityType, d.sourceEntityId, d.contractId)
    };
  }

  private hrefFor(sourceEntityType: string, sourceEntityId: string, contractId: string | null): string | null {
    switch (sourceEntityType) {
      case "Contract":
        return `/contracts/${sourceEntityId}`;
      case "ContractScheduleMilestone":
        return contractId ? `/contracts/${contractId}#cronogramas` : null;
      case "ContractOccurrence":
        return contractId ? `/contracts/${contractId}#ocorrencias` : null;
      case "Measurement":
        return `/measurements/${sourceEntityId}`;
      case "ContractFeature":
      case "ContractModule":
        return contractId ? `/modulos?contractId=${contractId}` : "/modulos";
      default:
        return contractId ? `/contracts/${contractId}` : null;
    }
  }

  private organizationScope(): Prisma.DeadlineWhereInput {
    const actor = requestActorStore.getStore();
    if (actor?.allOrganizationsActive || !actor?.organizationId) {
      return {};
    }
    return {
      contract: { is: { organizationId: actor.organizationId } }
    };
  }
}
