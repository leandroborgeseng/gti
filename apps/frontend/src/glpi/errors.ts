import { AxiosError } from "axios";

export function toErrorLog(error: unknown): { message: string; stack?: string } {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const url = error.config?.url;
    const method = error.config?.method;
    const responseText =
      typeof error.response?.data === "string"
        ? error.response.data
        : error.response?.data
          ? JSON.stringify(error.response.data)
          : "";

    return {
      message: `[HTTP] ${method || "?"} ${url || "?"} -> ${status || "sem_status"} ${responseText}`.trim(),
      stack: error.stack
    };
  }

  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}
