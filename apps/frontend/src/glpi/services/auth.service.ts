import axios from "axios";
import { Buffer } from "node:buffer";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { GlpiAuthResponse } from "../types/glpi.types";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let inFlightTokenPromise: Promise<string> | null = null;

function isTokenValid(): boolean {
  return Boolean(cachedToken) && Date.now() < tokenExpiresAt;
}

function resolveTokenUrl(): string {
  if (env.GLPI_TOKEN_URL) {
    return env.GLPI_TOKEN_URL;
  }
  const base = env.GLPI_BASE_URL.replace(/\/+$/, "");
  return `${base}/token`;
}

async function requestNewToken(): Promise<string> {
  const url = resolveTokenUrl();
  const basePayload = {
    grant_type: "password",
    client_id: env.GLPI_CLIENT_ID,
    client_secret: env.GLPI_CLIENT_SECRET,
    username: env.GLPI_USERNAME,
    password: env.GLPI_PASSWORD
  } as Record<string, string>;
  if (env.GLPI_OAUTH_SCOPE.trim()) {
    basePayload.scope = env.GLPI_OAUTH_SCOPE.trim();
  }
  const params = new URLSearchParams(basePayload);
  const basicAuth = Buffer.from(`${env.GLPI_CLIENT_ID}:${env.GLPI_CLIENT_SECRET}`).toString("base64");

  const attempts = [
    async () =>
      axios.post<GlpiAuthResponse>(url, params.toString(), {
        timeout: env.HTTP_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": env.GLPI_USER_AGENT
        }
      }),
    async () =>
      axios.post<GlpiAuthResponse>(
        url,
        {
          ...basePayload
        },
        {
          timeout: env.HTTP_TIMEOUT_MS,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": env.GLPI_USER_AGENT
          }
        }
      ),
    async () =>
      axios.post<GlpiAuthResponse>(
        url,
        {
          grant_type: "password",
          username: env.GLPI_USERNAME,
          password: env.GLPI_PASSWORD,
          ...(env.GLPI_OAUTH_SCOPE.trim() ? { scope: env.GLPI_OAUTH_SCOPE.trim() } : {})
        },
        {
          timeout: env.HTTP_TIMEOUT_MS,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": env.GLPI_USER_AGENT,
            Authorization: `Basic ${basicAuth}`
          }
        }
      )
  ];

  let lastError: unknown;
  let response: { data?: GlpiAuthResponse } | null = null;

  for (const attempt of attempts) {
    try {
      response = await attempt();
      if (response.data?.access_token) {
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (!response?.data?.access_token) {
    throw (lastError instanceof Error ? lastError : new Error("Resposta de autenticacao sem access_token"));
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
