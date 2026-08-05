import type { PrismaClient } from "@prisma/client";
import {
  resolveAuditCatalogKeys,
  type AuditDetailLevel
} from "../modules/audit-logs/audit-event-catalog";

export type AuditGateDecision = {
  enabled: boolean;
  detailLevel: AuditDetailLevel;
  /** true quando não há linha no catálogo (comportamento legado: grava tudo). */
  unconfigured: boolean;
};

type PrismaLike = Pick<PrismaClient, "auditEventConfig">;

/**
 * Consulta preferências de auditoria. Sem linha correspondente → habilitado
 * (compatível com o comportamento atual). Eventos mandatory ignoram desmarcação.
 */
export async function resolveAuditGate(
  prisma: PrismaLike,
  entity: string,
  action: string
): Promise<AuditGateDecision> {
  const keys = resolveAuditCatalogKeys(entity, action);
  if (keys.moduleKey === "other") {
    return { enabled: true, detailLevel: "ACTION_AND_VALUES", unconfigured: true };
  }

  try {
    const row = await prisma.auditEventConfig.findUnique({
      where: {
        moduleKey_screenKey_actionKey: {
          moduleKey: keys.moduleKey,
          screenKey: keys.screenKey,
          actionKey: keys.actionKey
        }
      },
      select: { enabled: true, detailLevel: true, mandatory: true }
    });
    if (!row) {
      return { enabled: true, detailLevel: "ACTION_AND_VALUES", unconfigured: true };
    }
    const detailLevel =
      row.detailLevel === "ACTION_ONLY" ? "ACTION_ONLY" : "ACTION_AND_VALUES";
    if (row.mandatory) {
      return { enabled: true, detailLevel, unconfigured: false };
    }
    return { enabled: row.enabled, detailLevel, unconfigured: false };
  } catch {
    // Tabela ainda não migrada ou cliente Prisma antigo — não bloqueia gravação.
    return { enabled: true, detailLevel: "ACTION_AND_VALUES", unconfigured: true };
  }
}

/** Aplica o nível de detalhe: ACTION_ONLY omite valores antes/depois. */
export function applyAuditDetailLevel<T>(
  detailLevel: AuditDetailLevel,
  value: T | null | undefined
): T | undefined {
  if (detailLevel === "ACTION_ONLY") return undefined;
  return value ?? undefined;
}
