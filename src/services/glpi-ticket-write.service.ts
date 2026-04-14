import { logger } from "../config/logger";
import { glpiClient } from "./glpi.client";
import { getDiscoveredTicketsPath } from "./openapi.loader";
import { resolveTicketsPath } from "./tickets.service";

function ticketItemPath(glpiId: number): string {
  const base = resolveTicketsPath(getDiscoveredTicketsPath()).replace(/\/$/, "");
  return `${base}/${glpiId}`;
}

export async function fetchGlpiTicketJson(glpiId: number): Promise<unknown> {
  const url = ticketItemPath(glpiId);
  const res = await glpiClient.get<unknown>(url, { validateStatus: () => true });
  if (res.status >= 400) {
    const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    throw new Error(`GET ${url} -> ${res.status} ${body}`);
  }
  logger.info({ glpiId, status: res.status }, "Ticket GLPI carregado");
  const payload = res.data as unknown;
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

export async function patchGlpiTicketJson(glpiId: number, body: Record<string, unknown>): Promise<void> {
  const url = ticketItemPath(glpiId);
  const res = await glpiClient.patch<unknown>(url, body, {
    headers: { "Content-Type": "application/json" },
    validateStatus: () => true
  });
  if (res.status >= 400) {
    const data = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    throw new Error(`PATCH ${url} -> ${res.status} ${data}`);
  }
  logger.info({ glpiId, status: res.status }, "Ticket GLPI atualizado");
}
