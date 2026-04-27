/**
 * Metadados sem segredos para perceber se o contêiner recebe variáveis da Railway / `GTI_ENV_JSON`.
 */

export function diagnosticoPlataformaEnv(): {
  gtiEnvJsonDefinida: boolean;
  gtiEnvJsonComprimento: number;
  railway: Record<string, boolean>;
} {
  const raw = process.env["GTI_ENV_JSON"];
  const gtiEnvJsonComprimento = typeof raw === "string" ? raw.length : 0;
  const railwayKeys = ["RAILWAY_SERVICE_ID", "RAILWAY_PROJECT_ID", "RAILWAY_ENVIRONMENT", "RAILWAY_GIT_COMMIT_SHA"] as const;
  const railway: Record<string, boolean> = {};
  for (const k of railwayKeys) {
    railway[k] = Boolean(process.env[k]?.trim());
  }
  return {
    gtiEnvJsonDefinida: gtiEnvJsonComprimento > 0,
    gtiEnvJsonComprimento,
    railway
  };
}
