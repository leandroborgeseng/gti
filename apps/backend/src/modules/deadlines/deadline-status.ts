import {
  DeadlineAttentionLevel,
  DeadlineOrigin,
  DeadlineStatus,
  type ContractItemCriticality
} from "@prisma/client";

const NEAR_DUE_DAYS = 7;

/** Início do dia civil em UTC (comparação estável de datas sem hora). */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfUtcMonth(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12, 0, 23, 59, 59, 999));
}

export function computeDeadlineStatus(dueAt: Date, now: Date = new Date()): DeadlineStatus {
  const dueDay = startOfUtcDay(dueAt);
  const today = startOfUtcDay(now);
  if (dueDay.getTime() < today.getTime()) return DeadlineStatus.OVERDUE;
  if (dueDay.getTime() === today.getTime()) return DeadlineStatus.DUE_TODAY;
  const nearMs = NEAR_DUE_DAYS * 24 * 60 * 60 * 1000;
  if (dueDay.getTime() - today.getTime() <= nearMs) return DeadlineStatus.NEAR_DUE;
  return DeadlineStatus.FUTURE;
}

export function computeCompletedStatus(dueAt: Date, completedAt: Date): DeadlineStatus {
  return startOfUtcDay(completedAt).getTime() <= startOfUtcDay(dueAt).getTime()
    ? DeadlineStatus.DONE_ON_TIME
    : DeadlineStatus.DONE_LATE;
}

const OPEN_STATUSES: DeadlineStatus[] = [
  DeadlineStatus.FUTURE,
  DeadlineStatus.NEAR_DUE,
  DeadlineStatus.DUE_TODAY,
  DeadlineStatus.OVERDUE,
  DeadlineStatus.SUSPENDED,
  DeadlineStatus.EXTENDED
];

export function isOpenDeadlineStatus(status: DeadlineStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function attentionFromStatus(
  status: DeadlineStatus,
  origin?: DeadlineOrigin,
  criticality?: ContractItemCriticality | null
): DeadlineAttentionLevel {
  if (status === DeadlineStatus.OVERDUE) return DeadlineAttentionLevel.CRITICAL;
  if (status === DeadlineStatus.DUE_TODAY) return DeadlineAttentionLevel.HIGH;
  if (status === DeadlineStatus.NEAR_DUE) {
    if (criticality === "CRITICA" || origin === DeadlineOrigin.CONTRACT_END) {
      return DeadlineAttentionLevel.HIGH;
    }
    return DeadlineAttentionLevel.MEDIUM;
  }
  if (criticality === "CRITICA") return DeadlineAttentionLevel.MEDIUM;
  return DeadlineAttentionLevel.LOW;
}

export function buildSyncKey(
  origin: DeadlineOrigin,
  sourceEntityType: string,
  sourceEntityId: string,
  responsibleUserId: string | null | undefined,
  variant = "default"
): string {
  return [origin, sourceEntityType, sourceEntityId, responsibleUserId ?? "_", variant].join("|");
}
