import { AxiosResponse } from "axios";
import { logger } from "../config/logger";
import { glpiClient } from "./glpi.client";
import { getDiscoveredTicketsPath } from "./openapi.loader";

interface TicketsPageResponse {
  data?: unknown[];
  items?: unknown[];
  results?: unknown[];
  [index: number]: unknown;
  [key: string]: unknown;
}

interface GetTicketsPageOptions {
  sort?: string;
}

function resolveTicketsPath(rawPath: string): string {
  if (/^https?:\/\//i.test(rawPath)) {
    return rawPath;
  }
  if (/^\/v2\//i.test(rawPath)) {
    return rawPath;
  }
  if (rawPath.startsWith("/")) {
    return `/v2${rawPath}`;
  }
  return `/v2/${rawPath}`;
}

function pickTicketArray(payload: TicketsPageResponse | unknown[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) {
    return payload.data;
  }
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  if (Array.isArray(payload.results)) {
    return payload.results;
  }
  const numericKeyValues = Object.entries(payload)
    .filter(([key, value]) => /^\d+$/.test(key) && value !== null && typeof value === "object")
    .map(([, value]) => value);
  if (numericKeyValues.length > 0) {
    return numericKeyValues;
  }
  return [];
}

export interface TicketsPageResult {
  tickets: unknown[];
  remoteTotal?: number;
}

function parseContentRangeTotal(contentRange: string | undefined): number | undefined {
  if (!contentRange) return undefined;
  // Example: "0-99/6730"
  const match = contentRange.match(/\/(\d+)\s*$/);
  if (!match) return undefined;
  const total = Number(match[1]);
  return Number.isFinite(total) ? total : undefined;
}

export async function getTicketsPage(page: number, pageSize = 100, options: GetTicketsPageOptions = {}): Promise<TicketsPageResult> {
  const ticketsPath = resolveTicketsPath(getDiscoveredTicketsPath());
  const start = Math.max(0, (page - 1) * pageSize);
  const end = start + pageSize - 1;
  const baseParams = options.sort ? { sort: options.sort } : {};

  const attempts = [
    () =>
      glpiClient.get<TicketsPageResponse | unknown[]>(ticketsPath, {
        params: {
          start,
          limit: pageSize,
          ...baseParams
        },
        validateStatus: () => true
      }),
    () =>
      glpiClient.get<TicketsPageResponse | unknown[]>(ticketsPath, {
        params: {
          range: `${start}-${end}`,
          ...baseParams
        },
        validateStatus: () => true
      }),
    () =>
      glpiClient.get<TicketsPageResponse | unknown[]>(ticketsPath, {
        params: {
          page,
          per_page: pageSize,
          ...baseParams
        },
        validateStatus: () => true
      }),
    () =>
      glpiClient.get<TicketsPageResponse | unknown[]>(ticketsPath, {
        params: {
          limit: pageSize,
          offset: start,
          ...baseParams
        },
        validateStatus: () => true
      }),
    () =>
      glpiClient.get<TicketsPageResponse | unknown[]>(ticketsPath, {
        params: {
          range: `${start}-${end}`,
          get_hateoas: false,
          only_id: false,
          ...baseParams
        },
        validateStatus: () => true
      })
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const response: AxiosResponse<TicketsPageResponse | unknown[]> = await attempt();
      const status = response.status;
      if (status >= 400) {
        lastError = new Error(`Falha ao buscar pagina de tickets (${status})`);
        continue;
      }
      const tickets = pickTicketArray(response.data);
      const remoteTotal = parseContentRangeTotal(response.headers?.["content-range"] as string | undefined);
      logger.info({ page, count: tickets.length, path: ticketsPath, remoteTotal }, "Pagina de tickets carregada");
      return { tickets, remoteTotal };
    } catch (error) {
      lastError = error;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("Falha ao buscar pagina de tickets"));
}

export async function getAllTickets(pageSize = 100): Promise<unknown[]> {
  const allTickets: unknown[] = [];
  let page = 1;

  while (true) {
    const { tickets: pageTickets } = await getTicketsPage(page, pageSize);
    allTickets.push(...pageTickets);

    if (pageTickets.length < pageSize) {
      break;
    }

    page += 1;
  }

  logger.info({ total: allTickets.length }, "Total de tickets carregados");
  return allTickets;
}
