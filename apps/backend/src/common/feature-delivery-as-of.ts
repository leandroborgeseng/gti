/**
 * Resolve o percentual de entrega vigente em uma data de corte
 * a partir do histórico temporal (eventos ACTIVE), ticket 96/98.
 */

export type DeliveryEventLike = {
  effectiveDate: Date;
  deliveryStatus: string;
  percent: number;
  status: string;
  recordedAt?: Date;
};

export type DeliveryMirrorLike = {
  deliveryStatus?: string | null;
  partialDeliveryPercent?: number | null;
  deliveryEffectiveDate?: Date | null;
  /** Legado: status VALIDATED = entregue. */
  status?: string | null;
};

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Fração 0–1 vigente em `asOf`, usando o último evento ACTIVE com
 * effectiveDate ≤ asOf. Sem eventos, usa o espelho atual (legado) se a
 * data efetiva do espelho for ≤ asOf.
 */
export function deliveryFractionAsOf(
  asOf: Date,
  events: DeliveryEventLike[] | null | undefined,
  mirror?: DeliveryMirrorLike | null
): number {
  const asOfKey = utcDay(asOf);
  const active = (events ?? [])
    .filter((e) => e.status === "ACTIVE" && utcDay(e.effectiveDate) <= asOfKey)
    .sort((a, b) => {
      const byDate = utcDay(b.effectiveDate) - utcDay(a.effectiveDate);
      if (byDate !== 0) return byDate;
      const ar = a.recordedAt?.getTime() ?? 0;
      const br = b.recordedAt?.getTime() ?? 0;
      return br - ar;
    });

  const latest = active[0];
  if (latest) {
    if (latest.deliveryStatus === "DELIVERED") return 1;
    if (latest.deliveryStatus === "PARTIALLY_DELIVERED") {
      const p = latest.percent;
      if (p != null && Number.isFinite(p) && p >= 0 && p <= 100) return p / 100;
      return 0.5;
    }
    return 0;
  }

  // Sem histórico ACTIVE até a data: espelho legado (somente se data efetiva ≤ corte).
  if (!mirror) return 0;
  if (mirror.deliveryEffectiveDate && utcDay(mirror.deliveryEffectiveDate) > asOfKey) {
    return 0;
  }
  if (mirror.deliveryStatus === "DELIVERED" || mirror.status === "VALIDATED") return 1;
  if (mirror.deliveryStatus === "PARTIALLY_DELIVERED") {
    const p = mirror.partialDeliveryPercent;
    if (p != null && Number.isFinite(p) && p >= 0 && p <= 100) return p / 100;
    return 0.5;
  }
  return 0;
}

/** Snapshot resumido do evento vigente na data (para memória da medição). */
export function deliverySnapshotAsOf(
  asOf: Date,
  events: DeliveryEventLike[] | null | undefined,
  mirror?: DeliveryMirrorLike | null
): {
  fractionAsOf: number;
  deliveryStatusAsOf: string | null;
  percentAsOf: number | null;
  effectiveDateAsOf: string | null;
} {
  const asOfKey = utcDay(asOf);
  const active = (events ?? [])
    .filter((e) => e.status === "ACTIVE" && utcDay(e.effectiveDate) <= asOfKey)
    .sort((a, b) => {
      const byDate = utcDay(b.effectiveDate) - utcDay(a.effectiveDate);
      if (byDate !== 0) return byDate;
      const ar = a.recordedAt?.getTime() ?? 0;
      const br = b.recordedAt?.getTime() ?? 0;
      return br - ar;
    });
  const latest = active[0];
  if (latest) {
    const fraction = deliveryFractionAsOf(asOf, events, mirror);
    return {
      fractionAsOf: fraction,
      deliveryStatusAsOf: latest.deliveryStatus,
      percentAsOf: latest.percent,
      effectiveDateAsOf: latest.effectiveDate.toISOString().slice(0, 10)
    };
  }
  const fraction = deliveryFractionAsOf(asOf, [], mirror);
  return {
    fractionAsOf: fraction,
    deliveryStatusAsOf: mirror?.deliveryStatus ?? null,
    percentAsOf:
      mirror?.deliveryStatus === "PARTIALLY_DELIVERED"
        ? mirror.partialDeliveryPercent ?? null
        : mirror?.deliveryStatus === "DELIVERED"
          ? 100
          : null,
    effectiveDateAsOf: mirror?.deliveryEffectiveDate
      ? mirror.deliveryEffectiveDate.toISOString().slice(0, 10)
      : null
  };
}
