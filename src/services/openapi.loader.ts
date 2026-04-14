import fs from "node:fs/promises";
import path from "node:path";
import axios from "axios";
import { env } from "../config/env";
import { logger } from "../config/logger";

const TMP_OPENAPI_PATH = path.join("/tmp", "glpi-doc.json");
let discoveredTicketsPath = "/tickets";

export async function loadOpenApiSpec(): Promise<Record<string, unknown>> {
  const response = await axios.get<Record<string, unknown>>(env.GLPI_DOC_URL, {
    timeout: env.HTTP_TIMEOUT_MS
  });

  await fs.writeFile(TMP_OPENAPI_PATH, JSON.stringify(response.data, null, 2), "utf-8");

  const paths = response.data.paths;
  if (paths && typeof paths === "object") {
    const pathEntries = Object.keys(paths as Record<string, unknown>);
    const detected =
      pathEntries.find((key) => /ticket/i.test(key) && /get/i.test(JSON.stringify((paths as Record<string, unknown>)[key]))) ||
      pathEntries.find((key) => /ticket/i.test(key));
    if (detected) {
      discoveredTicketsPath = detected;
    }
  }

  logger.info({ path: TMP_OPENAPI_PATH, ticketsPath: discoveredTicketsPath }, "Doc OpenAPI GLPI baixado e endpoints descobertos");

  return response.data;
}

export function getDiscoveredTicketsPath(): string {
  return discoveredTicketsPath;
}
