import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import { env } from "../config/env";
import { getAccessToken } from "./auth.service";
import { logger } from "../config/logger";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error: AxiosError): boolean {
  if (error.code === "ECONNABORTED") {
    return true;
  }
  const status = error.response?.status;
  return status === 429 || (status !== undefined && status >= 500);
}

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

export const glpiClient: AxiosInstance = axios.create({
  baseURL: env.GLPI_BASE_URL,
  timeout: env.HTTP_TIMEOUT_MS,
  headers: {
    Accept: "application/json",
    "User-Agent": env.GLPI_USER_AGENT
  }
});

glpiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getAccessToken();
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  }
);

glpiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableRequestConfig | undefined;
    if (!config) {
      throw error;
    }

    if (error.response?.status === 401 && !config._retryCount) {
      const newToken = await getAccessToken(true);
      config.headers.Authorization = `Bearer ${newToken}`;
      config._retryCount = 1;
      return glpiClient.request(config as AxiosRequestConfig);
    }

    config._retryCount = config._retryCount || 0;
    if (config._retryCount < MAX_RETRIES && shouldRetry(error)) {
      config._retryCount += 1;
      await sleep(RETRY_DELAY_MS * config._retryCount);
      logger.warn(
        {
          retryCount: config._retryCount,
          method: config.method,
          url: config.url,
          status: error.response?.status
        },
        "Requisicao GLPI com retry"
      );
      return glpiClient.request(config as AxiosRequestConfig);
    }

    throw error;
  }
);
