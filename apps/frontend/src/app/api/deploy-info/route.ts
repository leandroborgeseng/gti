import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico de deploy (Railway / CI): confirma que esta imagem corresponde ao Git esperado.
 * Builds antigos com proxy HTTP para Nest não incluem esta rota ou devolvem conteúdo diferente.
 */
export async function GET() {
  return NextResponse.json({
    gestaoApi: "next-route-handlers",
    /** Se o teu browser/curl não vê isto, ainda estás numa imagem antiga com `console.error('[gti/api-proxy]…')` no catch-all. */
    catchAllHandler: "gestao-dispatch",
    nestHttpProxyInCatchAll: false,
    gitSha: process.env.RAILWAY_GIT_COMMIT_SHA?.trim() || process.env.NEXT_PUBLIC_GTI_BUILD?.trim() || null,
    backendFetchTimeoutDefaultMs: 60_000,
  });
}
