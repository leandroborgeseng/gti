import { NextResponse } from "next/server";
import { readDeployGitShaEnv, resolveDeployGitSha } from "@/lib/deploy-git-sha";
import { readBuildRecordedGitSha } from "@/lib/read-build-git-sha";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Identifica o commit em execução (smoke de corte no Coolify e na Railway).
 * `gitSha` é o SHA resolvido; `gitShaSource` indica a fonte.
 * Sem nenhuma fonte, os dois campos ficam `unknown` — a rota não falha.
 */
export async function GET() {
  const { gitSha, gitShaSource } = resolveDeployGitSha({
    env: readDeployGitShaEnv(),
    buildSha: readBuildRecordedGitSha(),
  });

  return NextResponse.json(
    {
      gestaoApi: "next-route-handlers",
      /** Se o cliente não vê isso, a imagem ainda é antiga (proxy HTTP para Nest no catch-all). */
      catchAllHandler: "gestao-dispatch",
      nestHttpProxyInCatchAll: false,
      gitSha,
      gitShaSource,
      backendFetchTimeoutDefaultMs: 60_000,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
