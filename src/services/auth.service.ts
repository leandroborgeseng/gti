import axios from "axios";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { GlpiAuthResponse } from "../types/glpi.types";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let inFlightTokenPromise: Promise<string> | null = null;

function isTokenValid(): boolean {
  return Boolean(cachedToken) && Date.now() < tokenExpiresAt;
}

async function requestNewToken(): Promise<string> {
  const url = `${env.GLPI_BASE_URL}/token`;

  const response = await axios.post<GlpiAuthResponse>(
    url,
    {
      client_id: env.GLPI_CLIENT_ID,
      client_secret: env.GLPI_CLIENT_SECRET,
      username: env.GLPI_USERNAME,
      password: env.GLPI_PASSWORD
    },
    {
      timeout: env.HTTP_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

  if (!response.data?.access_token) {
    throw new Error("Resposta de autenticacao sem access_token");
  }

  const expiresInSeconds = Number(response.data.expires_in || 3600);
  const safetySeconds = 60;

  cachedToken = response.data.access_token;
  tokenExpiresAt = Date.now() + Math.max(expiresInSeconds - safetySeconds, 60) * 1000;

  logger.info({ expiresInSeconds }, "Autenticacao GLPI OK");
  return cachedToken;
}

export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && isTokenValid() && cachedToken) {
    return cachedToken;
  }

  if (!inFlightTokenPromise) {
    inFlightTokenPromise = requestNewToken().finally(() => {
      inFlightTokenPromise = null;
    });
  }

  return inFlightTokenPromise;
}
