import fs from "node:fs/promises";
import path from "node:path";
import axios from "axios";
import { env } from "../config/env";
import { logger } from "../config/logger";

const TMP_OPENAPI_PATH = path.join("/tmp", "glpi-doc.json");
let discoveredTicketsPath = normalizeApiPath(env.GLPI_TICKETS_PATH);

function normalizeApiPath(rawPath: string): string {
  if (!rawPath) return "/Assistance/Ticket";

  try {
    if (/^https?:\/\//i.test(rawPath)) {
      const url = new URL(rawPath);
      rawPath = url.pathname;
    }
  } catch {
    // Keep original value if URL parsing fails.
  }

  rawPath = rawPath.trim();
  if (!rawPath.startsWith("/")) {
    rawPath = `/${rawPath}`;
  }

  const apiPrefix = "/api.php";
  if (rawPath.startsWith(`${apiPrefix}/`)) {
    rawPath = rawPath.slice(apiPrefix.length);
  }

  return rawPath || "/Assistance/Ticket";
}

function detectTicketsPath(paths: Record<string, unknown>): string {
  const pathEntries = Object.keys(paths);
  const normalizedEntries = pathEntries.map((entry) => normalizeApiPath(entry));

  const assistanceTicketPath = normalizedEntries.find((entry) => /\/assistance\/ticket$/i.test(entry));
  if (assistanceTicketPath) {
    return assistanceTicketPath;
  }

  const ticketPath = normalizedEntries.find((entry) => /\/ticket$/i.test(entry));
  if (ticketPath) {
    return ticketPath;
  }

  const anyTicketPath = normalizedEntries.find((entry) => /ticket/i.test(entry));
  if (anyTicketPath) {
    return anyTicketPath;
  }

  return "/Assistance/Ticket";
}

export async function loadOpenApiSpec(): Promise<Record<string, unknown>> {
  const response = await axios.get<Record<string, unknown>>(env.GLPI_DOC_URL, {
    timeout: env.HTTP_TIMEOUT_MS,
    headers: {
      Accept: "application/json",
      "User-Agent": env.GLPI_USER_AGENT
    }
  });

  await fs.writeFile(TMP_OPENAPI_PATH, JSON.stringify(response.data, null, 2), "utf-8");

  const paths = response.data.paths;
  if (paths && typeof paths === "object") {
    discoveredTicketsPath = detectTicketsPath(paths as Record<string, unknown>);
  }

  logger.info({ path: TMP_OPENAPI_PATH, ticketsPath: discoveredTicketsPath }, "Doc OpenAPI GLPI baixado e endpoints descobertos");

  return response.data;
}

export function getDiscoveredTicketsPath(): string {
  return discoveredTicketsPath;
}
