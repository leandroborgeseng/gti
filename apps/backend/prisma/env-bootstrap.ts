/**
 * Carrega `.env` da raiz do monorepo e de `apps/backend` antes de `PrismaClient`
 * (útil quando `ts-node` não herda variáveis do shell).
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function loadEnvFile(filePath: string, overrideExisting: boolean): void {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    if (!overrideExisting && process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const here = __dirname;
loadEnvFile(resolve(here, "../../../.env"), false);
/** `apps/backend/.env` sobrepõe chaves da raiz (ex.: `DATABASE_URL` local do Nest). */
loadEnvFile(resolve(here, "../../.env"), true);
