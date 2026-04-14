import { AxiosResponse } from "axios";
import { logger } from "../config/logger";
import { glpiClient } from "./glpi.client";
import { getDiscoveredTicketsPath } from "./openapi.loader";

interface TicketsPageResponse {
  data?: unknown[];
  items?: unknown[];
  results?: unknown[];
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
  return [];
}

export async function getTicketsPage(page: number, pageSize = 100): Promise<unknown[]> {
  const ticketsPath = getDiscoveredTicketsPath();
  const response: AxiosResponse<TicketsPageResponse | unknown[]> = await glpiClient.get(ticketsPath, {
    params: {
      page,
      per_page: pageSize
    }
  });

  const tickets = pickTicketArray(response.data);
  logger.info({ page, count: tickets.length }, "Pagina de tickets carregada");
  return tickets;
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
