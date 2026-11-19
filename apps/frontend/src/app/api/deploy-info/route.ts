import { NextResponse } from "next/server";
import { readDeployGitShaEnv, resolveDeployGitSha } from "@/lib/deploy-git-sha";
import { readBuildRecordedGitSha } from "@/lib/read-build-git-sha";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

/**
 * Identifica o commit em execução (smoke de corte no Coolify e na Railway).
 * `gitSha` é o SHA resolvido; `gitShaSource` indica a fonte.
 * Sem nenhuma fonte válida, os dois campos ficam `unknown` — a rota não falha.
 * Falha inesperada devolve 500, também sem cache.
 */
export async function GET() {
  try {
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
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[deploy-info] Falha ao resolver o commit em execução.", error);
    return NextResponse.json(
      { error: "Não foi possível identificar o commit em execução." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
