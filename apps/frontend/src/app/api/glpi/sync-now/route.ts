import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/glpi/config/prisma";
import {
  limparSyncOrfaNaBdSeNecessario,
  mergeGlpiSyncStatusForApi,
  readGlpiSyncStatusFromDb
} from "@/glpi/glpi-sync-status-persistence";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import { verifyBearerToken } from "@/lib/verify-bearer-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_UTF8 = { "content-type": "application/json; charset=utf-8" } as const;

/**
 * Inicia sincronização GLPI no pedido atual (administradores e editores).
 * Usa cookie de sessão; complementa POST /api/glpi/sync com segredo só para automatismos externos.
 */
export async function POST(): Promise<NextResponse> {
  const token = cookies().get(GTI_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401, headers: JSON_UTF8 });
  }

  let session: Awaited<ReturnType<typeof verifyBearerToken>>;
  try {
    session = await verifyBearerToken(token);
  } catch {
    return NextResponse.json({ ok: false, message: "Sessão inválida." }, { status: 401, headers: JSON_UTF8 });
  }

  if (session.mustChangePassword) {
    return NextResponse.json(
      { ok: false, message: "Altere a sua senha antes de continuar." },
      { status: 403, headers: JSON_UTF8 }
    );
  }
  if (session.role !== "ADMIN" && session.role !== "EDITOR") {
    return NextResponse.json(
      { ok: false, message: "Sem permissão para forçar a sincronização." },
      { status: 403, headers: JSON_UTF8 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || user.email !== session.email) {
    return NextResponse.json({ ok: false, message: "Sessão inválida." }, { status: 401, headers: JSON_UTF8 });
  }

  await limparSyncOrfaNaBdSeNecessario();
  const mod = await import("@/glpi/sync-cron");
  const mergedPre = mergeGlpiSyncStatusForApi(await readGlpiSyncStatusFromDb(), { ...mod.syncStatus });
  if (mergedPre.isRunning) {
    return NextResponse.json(
      {
        ok: false,
        skipped: true,
        message:
          "Já existe sincronização GLPI em curso. Aguarde a conclusão ou peça ao suporte técnico o estado detalhado em /api/glpi/status."
      },
      { status: 409, headers: JSON_UTF8 }
    );
  }

  const ran = await mod.runSyncWithGuard();
  if (!ran) {
    return NextResponse.json(
      {
        ok: false,
        skipped: true,
        message:
          "Não foi possível iniciar neste instante: outra sincronização começou quase ao mesmo tempo. Tente de novo dentro de alguns segundos."
      },
      { status: 409, headers: JSON_UTF8 }
    );
  }

  const post = mergeGlpiSyncStatusForApi(await readGlpiSyncStatusFromDb(), { ...mod.syncStatus });
  const { persistedAt: _p, ...sync } = post;
  const err = typeof sync.lastError === "string" ? sync.lastError.trim() : "";
  const saved = typeof sync.lastSaved === "number" ? sync.lastSaved : 0;
  const message = err.length
    ? `Sincronização terminou com erro ou falha parcial: ${err}`
    : saved > 0
      ? `Sincronização concluída: ${saved} registo${saved === 1 ? "" : "s"} atualizado${saved === 1 ? "" : "s"} no cache.`
      : "Sincronização concluída (nenhuma alteração registada nesta passagem).";

  return NextResponse.json({ ok: err.length === 0, message, sync }, { status: 200, headers: JSON_UTF8 });
}
