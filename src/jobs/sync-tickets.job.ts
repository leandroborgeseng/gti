import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { normalizeTicket } from "../normalizers/ticket.normalizer";
import { getTicketsPage } from "../services/tickets.service";

export interface SyncTicketsResult {
  loaded: number;
  saved: number;
  failed: number;
}

export interface SyncProgress extends SyncTicketsResult {
  page: number;
}

interface SyncTicketsOptions {
  pageSize?: number;
  onProgress?: (progress: SyncProgress) => void;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

interface TicketAttributeInput {
  keyPath: string;
  valueType: string;
  valueText: string | null;
  valueJson: string | null;
}

function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

function flattenAttributes(value: unknown, path = "", output: TicketAttributeInput[] = []): TicketAttributeInput[] {
  if (value === null || value === undefined) {
    output.push({
      keyPath: path || "$",
      valueType: "null",
      valueText: null,
      valueJson: null
    });
    return output;
  }

  if (Array.isArray(value)) {
    output.push({
      keyPath: path || "$",
      valueType: "array",
      valueText: null,
      valueJson: toJsonString(value)
    });
    value.forEach((item, index) => {
      flattenAttributes(item, path ? `${path}[${index}]` : `[${index}]`, output);
    });
    return output;
  }

  if (typeof value === "object") {
    output.push({
      keyPath: path || "$",
      valueType: "object",
      valueText: null,
      valueJson: toJsonString(value)
    });
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nestedPath = path ? `${path}.${key}` : key;
      flattenAttributes(nested, nestedPath, output);
    }
    return output;
  }

  output.push({
    keyPath: path || "$",
    valueType: typeof value,
    valueText: String(value),
    valueJson: null
  });
  return output;
}

function parseIsoDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function syncTickets(options: SyncTicketsOptions = {}): Promise<SyncTicketsResult> {
  logger.info("Iniciando sincronizacao de tickets");

  const pageSize = options.pageSize ?? 100;
  const onProgress = options.onProgress;
  let page = 1;
  let loadedCount = 0;
  let savedCount = 0;
  let failedCount = 0;
  let maxDateMod = "";
  let maxDateCreation = "";
  const cursorState = await prisma.syncState.findUnique({ where: { key: "last_sync_date_mod" } });
  const previousCursor = cursorState?.value || null;

  while (true) {
    const { tickets: rawTickets, remoteTotal } = await getTicketsPage(page, pageSize);
    loadedCount += rawTickets.length;
    let reachedAlreadySyncedWindow = false;

    if (remoteTotal !== undefined) {
      await prisma.syncState.upsert({
        where: { key: "glpi_ticket_total" },
        update: { value: String(remoteTotal) },
        create: { key: "glpi_ticket_total", value: String(remoteTotal) }
      });
    }

    for (const rawTicket of rawTickets) {
      try {
        const normalized = normalizeTicket(rawTicket);
        const normalizedDateMod = normalized.date_modification ?? normalized.date_creation;
        const currentDateMs = parseIsoDate(normalizedDateMod);
        const previousDateMs = parseIsoDate(previousCursor);
        if (previousCursor && currentDateMs !== null && previousDateMs !== null && currentDateMs <= previousDateMs) {
          reachedAlreadySyncedWindow = true;
        }

        if (!normalized.id) {
          continue;
        }

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
            rawJson: normalized.raw
          },
          select: {
            id: true
          }
        });

        const flattened = flattenAttributes(rawTicket);
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

        if (normalized.date_modification && (!maxDateMod || normalized.date_modification > maxDateMod)) {
          maxDateMod = normalized.date_modification;
        }
        if (normalized.date_creation && (!maxDateCreation || normalized.date_creation > maxDateCreation)) {
          maxDateCreation = normalized.date_creation;
        }

        savedCount += 1;
      } catch (error) {
        failedCount += 1;
        logger.warn({ error: toErrorMessage(error) }, "Falha ao salvar ticket individual");
      }
    }

    onProgress?.({
      page,
      loaded: loadedCount,
      saved: savedCount,
      failed: failedCount
    });

    if (rawTickets.length < pageSize) {
      break;
    }
    // IMPORTANT: this GLPI endpoint rejected custom sort on this environment.
    // Without guaranteed ordering, stopping early can skip newer records.
    // Keep full scan behavior until a server-supported sort/filter is confirmed.
    void reachedAlreadySyncedWindow;

    page += 1;
  }

  const newCursor = maxDateMod || maxDateCreation || previousCursor || new Date().toISOString();
  await prisma.syncState.upsert({
    where: { key: "last_sync_date_mod" },
    update: { value: newCursor },
    create: { key: "last_sync_date_mod", value: newCursor }
  });

  const result: SyncTicketsResult = {
    loaded: loadedCount,
    saved: savedCount,
    failed: failedCount
  };
  logger.info(result, "Sincronizacao de tickets concluida");
  return result;
}
