import fs from "node:fs";
import path from "node:path";
import { normalizeGitSha } from "./deploy-git-sha";

/**
 * Arquivo gerado no stage final do Dockerfile.
 * Caminho absoluto: o Next sobe com cwd em `/app/apps/frontend`.
 */
export const BUILD_GIT_SHA_FILE = "/app/.deploy-git-sha";

export function buildGitShaCandidatePaths(cwd: string = process.cwd()): string[] {
  return [
    BUILD_GIT_SHA_FILE,
    path.resolve(cwd, ".deploy-git-sha"),
    path.resolve(cwd, "..", "..", ".deploy-git-sha"),
  ];
}

/**
 * Lê o SHA gravado na imagem. Não lança: arquivo ausente ou ilegível vira `null`.
 */
export function readBuildRecordedGitSha(options?: {
  paths?: readonly string[];
  readFile?: (filePath: string) => string;
}): string | null {
  const paths = options?.paths ?? buildGitShaCandidatePaths();
  const readFile = options?.readFile ?? ((filePath: string) => fs.readFileSync(filePath, "utf8"));
  const seen = new Set<string>();
  for (const filePath of paths) {
    if (seen.has(filePath)) continue;
    seen.add(filePath);
    try {
      const value = normalizeGitSha(readFile(filePath));
      if (value) return value;
    } catch {
      // Ausente ou ilegível: tenta o caminho seguinte.
    }
  }
  return null;
}
