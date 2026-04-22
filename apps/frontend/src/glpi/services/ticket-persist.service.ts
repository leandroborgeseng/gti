import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { flattenAttributes } from "../lib/ticket-attributes-flatten";
import { normalizeTicket } from "../normalizers/ticket.normalizer";
import type { NormalizedTicket } from "../types/glpi.types";
import { getCachedUsersByIds } from "./glpi-users-cache.service";
import type { RequesterContact } from "../utils/ticket-requester";
import { getTicketSyncScope } from "../utils/ticket-sync-scope";
import { isTicketClosedStatus } from "../utils/ticket-status";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export type PersistNormalizedResult = "saved" | "error";

export async function persistNormalizedTicket(
  normalized: NormalizedTicket,
  raw: unknown,
  requesterFallback?: RequesterContact | null
): Promise<PersistNormalizedResult> {
  if (!normalized.id) {
    return "error";
  }

  try {
    const requesterName = normalized.requester_name ?? requesterFallback?.displayName ?? null;
    const requesterEmail = normalized.requester_email ?? requesterFallback?.email ?? null;
    const requesterUserId = normalized.requester_user_id ?? requesterFallback?.userId ?? null;
    let assigneeName: string | null = normalized.assigned_user_name ?? null;
    if (normalized.assigned_user_id && normalized.assigned_user_id > 0) {
      const weak = (assigneeName ?? "").trim() === "" || (assigneeName ?? "").trim().startsWith("Utilizador #");
      if (weak) {
        const c = (await getCachedUsersByIds([normalized.assigned_user_id]).catch(() => new Map())).get(
          normalized.assigned_user_id
        );
        if (c?.displayName) {
          assigneeName = c.displayName;
        }
      }
    }
    /** Sem chamadas GET /User por ticket na sync: usa fallback do cache local de usuários ativos (quando disponível). */
    const savedTicket = await prisma.ticket.upsert({
      where: {
        glpiTicketId: normalized.id
      },
      update: {
        title: normalized.title,
        content: normalized.content,
        status: normalized.status,
        priority: normalized.priority,
        dateCreation: normalized.date_creation,
        dateModification: normalized.date_modification,
        contractGroupId: normalized.contract_group_id,
        contractGroupName: normalized.contract_group_name,
        requesterName,
        requesterEmail,
        requesterUserId,
        assignedUserId: normalized.assigned_user_id ?? null,
        assignedUserName: assigneeName,
        rawJson: normalized.raw
      },
      create: {
        glpiTicketId: normalized.id,
        title: normalized.title,
        content: normalized.content,
        status: normalized.status,
        priority: normalized.priority,
        dateCreation: normalized.date_creation,
        dateModification: normalized.date_modification,
        contractGroupId: normalized.contract_group_id,
        contractGroupName: normalized.contract_group_name,
        requesterName,
        requesterEmail,
        requesterUserId,
        assignedUserId: normalized.assigned_user_id ?? null,
        assignedUserName: assigneeName,
        rawJson: normalized.raw
      },
      select: {
        id: true
      }
    });

    const flattened = flattenAttributes(raw);
    await prisma.ticketAttribute.deleteMany({
      where: { ticketId: savedTicket.id }
    });
    if (flattened.length > 0) {
      await prisma.ticketAttribute.createMany({
        data: flattened.map((item) => ({
          ticketId: savedTicket.id,
          keyPath: item.keyPath.slice(0, 500),
          valueType: item.valueType.slice(0, 50),
          valueText: item.valueText,
          valueJson: item.valueJson
        }))
      });
    }

    return "saved";
  } catch (error) {
    logger.warn({ error: toErrorMessage(error), glpiTicketId: normalized.id }, "Falha ao salvar ticket individual");
    return "error";
  }
}

/** Atualiza ou remove do cache local conforme status e escopo de sync (`ticket_sync_scope`). */
export async function persistTicketFromRaw(raw: unknown): Promise<void> {
  const normalized = normalizeTicket(raw);
  if (!normalized.id) {
    throw new Error("Ticket sem id no payload GLPI");
  }

  if (isTicketClosedStatus(normalized.status)) {
    const scope = await getTicketSyncScope();
    if (scope === "open") {
      await prisma.ticket.deleteMany({ where: { glpiTicketId: normalized.id } });
      return;
    }
    const closedResult = await persistNormalizedTicket(normalized, raw);
    if (closedResult === "error") {
      throw new Error(`Falha ao persistir ticket fechado ${normalized.id}`);
    }
    return;
  }

  const result = await persistNormalizedTicket(normalized, raw);
  if (result === "error") {
    throw new Error(`Falha ao persistir ticket ${normalized.id}`);
  }
}

const BACKFILL_ASSIGNED_DEFAULT_LIMIT = 200;

/**
 * Reprocessa `rawJson` de tickets ainda sem técnico no cache (p.ex. após afinar o normalizador) e
 * aplica o mesmo corte de nomes do {@link persistNormalizedTicket}.
 */
export async function backfillAssignedUserFromCachedRaw(
  options?: { limit?: number }
): Promise<{ scanned: number; updated: number }> {
  const limit = options?.limit ?? BACKFILL_ASSIGNED_DEFAULT_LIMIT;
  let rows: { glpiTicketId: number; rawJson: unknown }[];
  try {
    rows = await prisma.$queryRaw<{ glpiTicketId: number; rawJson: unknown }[]>(
      Prisma.sql`SELECT "glpiTicketId", "rawJson" FROM "Ticket" WHERE "assignedUserId" IS NULL ORDER BY RANDOM() LIMIT ${limit}`
    );
  } catch (e) {
    rows = await prisma.ticket.findMany({
      where: { assignedUserId: null },
      take: limit,
      orderBy: { id: "asc" },
      select: { glpiTicketId: true, rawJson: true }
    });
    logger.debug({ err: toErrorMessage(e) }, "backfillAssigned: RANDOM() indisponível, usa amostra por id");
  }
  if (rows.length === 0) {
    return { scanned: 0, updated: 0 };
  }

  const toPatch: { glpiTicketId: number; userId: number; name: string | null }[] = [];
  const assigneeIds: number[] = [];
  for (const row of rows) {
    const n = normalizeTicket(row.rawJson);
    if (!n.assigned_user_id || n.assigned_user_id <= 0) {
      continue;
    }
    assigneeIds.push(n.assigned_user_id);
    toPatch.push({ glpiTicketId: row.glpiTicketId, userId: n.assigned_user_id, name: n.assigned_user_name });
  }
  if (toPatch.length === 0) {
    return { scanned: rows.length, updated: 0 };
  }

  const nameMap = await getCachedUsersByIds([...new Set(assigneeIds)]).catch(() => new Map<number, RequesterContact>());

  let updated = 0;
  for (const p of toPatch) {
    const weak = (p.name ?? "").trim() === "" || (p.name ?? "").trim().startsWith("Utilizador #");
    const display = weak
      ? nameMap.get(p.userId)?.displayName
      : p.name?.trim() || null;
    const res = await prisma.ticket.updateMany({
      where: { glpiTicketId: p.glpiTicketId, assignedUserId: null },
      data: {
        assignedUserId: p.userId,
        assignedUserName: display ?? p.name
      }
    });
    updated += res.count;
  }
  return { scanned: rows.length, updated };
}
