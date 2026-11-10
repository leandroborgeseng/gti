/**
 * Resolve o commit em execução para `GET /api/deploy-info`.
 *
 * Não usa `NEXT_PUBLIC_GTI_BUILD`: esse texto é opcional no modal de chamados
 * e pode ficar preso num hash curto (ex.: `a55af025`) sem indicar a origem.
 *
 * Precedência (o primeiro valor não vazio vence):
 * 1. `SOURCE_COMMIT` — Coolify (env de runtime e/ou build-arg)
 * 2. `RAILWAY_GIT_COMMIT_SHA` — Railway
 * 3. `GIT_SHA`
 * 4. `COMMIT_SHA`
 * 5. SHA gravado no build (`GTI_BUILD_GIT_SHA` ou arquivo da imagem)
 * 6. `"unknown"`
 *
 * Só entra um hash hexadecimal de 7 a 40 caracteres (SHA curto ou completo).
 * Texto fora desse formato — vazio, `unknown`, HTML ou outro conteúdo — é ignorado
 * e a resolução segue para a fonte seguinte.
 */

export const UNKNOWN_DEPLOY_GIT_SHA = "unknown";

export const DEPLOY_GIT_SHA_RUNTIME_SOURCES = [
  "SOURCE_COMMIT",
  "RAILWAY_GIT_COMMIT_SHA",
  "GIT_SHA",
  "COMMIT_SHA",
] as const;

/** Nome da env com o SHA gravado na imagem, distinto das envs de plataforma. */
export const DEPLOY_GIT_SHA_BUILD_ENV = "GTI_BUILD_GIT_SHA";

export type DeployGitShaRuntimeSource = (typeof DEPLOY_GIT_SHA_RUNTIME_SOURCES)[number];

export type DeployGitShaSource = DeployGitShaRuntimeSource | "build" | "unknown";

export type DeployGitShaEnv = Record<string, string | undefined>;

/** SHA curto (7) ou completo (até 40). Fora disso o valor conta como ausente. */
const GIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/;

export function normalizeGitSha(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!GIT_SHA_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Lê só as chaves usadas na resolução, com acesso dinâmico (`process.env[nome]`),
 * para o valor não ficar congelado no bundle do `next build`.
 */
export function readDeployGitShaEnv(source: DeployGitShaEnv = process.env): DeployGitShaEnv {
  const env: DeployGitShaEnv = {};
  for (const key of DEPLOY_GIT_SHA_RUNTIME_SOURCES) {
    env[key] = source[key];
  }
  env[DEPLOY_GIT_SHA_BUILD_ENV] = source[DEPLOY_GIT_SHA_BUILD_ENV];
  return env;
}

export function resolveDeployGitSha(
  input: {
    env?: DeployGitShaEnv;
    /** Conteúdo já lido do arquivo gravado no build (ex.: `/app/.deploy-git-sha`). */
    buildSha?: string | null;
  } = {}
): { gitSha: string; gitShaSource: DeployGitShaSource } {
  const env = input.env ?? {};
  for (const key of DEPLOY_GIT_SHA_RUNTIME_SOURCES) {
    const value = normalizeGitSha(env[key]);
    if (value) return { gitSha: value, gitShaSource: key };
  }
  const fromBuildEnv = normalizeGitSha(env[DEPLOY_GIT_SHA_BUILD_ENV]);
  if (fromBuildEnv) return { gitSha: fromBuildEnv, gitShaSource: "build" };
  const fromFile = normalizeGitSha(input.buildSha);
  if (fromFile) return { gitSha: fromFile, gitShaSource: "build" };
  return { gitSha: UNKNOWN_DEPLOY_GIT_SHA, gitShaSource: "unknown" };
}
