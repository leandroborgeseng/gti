import { NextResponse } from "next/server";
import { logger } from "@/glpi/config/logger";
import { toErrorLog } from "@/glpi/errors";
import { fetchGlpiTicketJson, postGlpiTicketFollowup } from "@/glpi/services/glpi-ticket-write.service";
import { persistTicketFromRaw } from "@/glpi/services/ticket-persist.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseGlpiId(params: { id: string }): number | null {
  const n = Number(params.id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(req: Request, ctx: { params: { id: string } }): Promise<NextResponse> {
  const glpiId = parseGlpiId(ctx.params);
  if (!glpiId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const isPrivate = body.isPrivate === true || body.isPrivate === 1 || body.isPrivate === "1";
    if (!content) {
      return NextResponse.json({ error: "Mensagem do acompanhamento não pode ficar vazia" }, { status: 400 });
    }
    await postGlpiTicketFollowup(glpiId, { content, isPrivate });
    const fresh = await fetchGlpiTicketJson(glpiId);
    await persistTicketFromRaw(fresh);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ error: toErrorLog(error) }, "Falha ao publicar acompanhamento no GLPI");
    return NextResponse.json(
      { error: "Falha ao publicar acompanhamento no GLPI", detail: toErrorLog(error).message },
      { status: 500 }
    );
  }
}
