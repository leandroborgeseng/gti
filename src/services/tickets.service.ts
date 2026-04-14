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

export async function getTicketsPage(page: number, pageSize = 100): Promise<unknown[]> {
  const ticketsPath = getDiscoveredTicketsPath();
  const start = Math.max(0, (page - 1) * pageSize);
  const end = start + pageSize - 1;

  const attempts = [
    () =>
      glpiClient.get<TicketsPageResponse | unknown[]>(ticketsPath, {
        params: {
          range: `${start}-${end}`
        }
      }),
    () =>
      glpiClient.get<TicketsPageResponse | unknown[]>(ticketsPath, {
        params: {
          page,
          per_page: pageSize
        }
      }),
    () =>
      glpiClient.get<TicketsPageResponse | unknown[]>(ticketsPath, {
        params: {
          limit: pageSize,
          offset: start
        }
      }),
    () =>
      glpiClient.get<TicketsPageResponse | unknown[]>(ticketsPath, {
        params: {
          range: `${start}-${end}`,
          get_hateoas: false,
          only_id: false
        }
      })
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const response: AxiosResponse<TicketsPageResponse | unknown[]> = await attempt();
      const tickets = pickTicketArray(response.data);
      logger.info({ page, count: tickets.length, path: ticketsPath }, "Pagina de tickets carregada");
      return tickets;
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
    const pageTickets = await getTicketsPage(page, pageSize);
    allTickets.push(...pageTickets);

    if (pageTickets.length < pageSize) {
      break;
    }

    page += 1;
  }

  logger.info({ total: allTickets.length }, "Total de tickets carregados");
  return allTickets;
}
