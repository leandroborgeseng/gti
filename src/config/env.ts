import dotenv from "dotenv";

dotenv.config();

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export const env = {
  GLPI_BASE_URL: getEnv("GLPI_BASE_URL"),
  GLPI_DOC_URL: getEnv("GLPI_DOC_URL"),
  GLPI_CLIENT_ID: getEnv("GLPI_CLIENT_ID"),
  GLPI_CLIENT_SECRET: getEnv("GLPI_CLIENT_SECRET"),
  GLPI_USERNAME: getEnv("GLPI_USERNAME"),
  GLPI_PASSWORD: getEnv("GLPI_PASSWORD"),
  PORT: Number(process.env.PORT || 3000),
  CRON_EXPRESSION: "*/5 * * * *",
  HTTP_TIMEOUT_MS: 20000
};
