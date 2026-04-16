import { NextResponse } from "next/server";
import { logger } from "@/glpi/config/logger";
import { toErrorLog } from "@/glpi/errors";
import { buildTicketDetailPayload } from "@/glpi/ticket-detail-payload";
import { fetchGlpiTicketJson, patchGlpiTicketJson } from "@/glpi/services/glpi-ticket-write.service";
import { persistTicketFromRaw } from "@/glpi/services/ticket-persist.service";
import { normalizeTicket } from "@/glpi/normalizers/ticket.normalizer";
import { loadAndPersistWaitingParty } from "@/glpi/services/glpi-ticket-history.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseGlpiId(params: { id: string }): number | null {
  const n = Number(params.id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(_req: Request, ctx: { params: { id: string } }): Promise<NextResponse> {
  const glpiId = parseGlpiId(ctx.params);
  if (!glpiId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const payload = await buildTicketDetailPayload(glpiId);
    if (!payload) {
      return NextResponse.json({ error: "Chamado não encontrado no cache local" }, { status: 404 });
    }
    return NextResponse.json(payload);
  } catch (error) {
    logger.error({ error: toErrorLog(error) }, "Falha ao carregar ticket para API");
    return NextResponse.json({ error: "Falha ao carregar ticket" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: { id: string } }): Promise<NextResponse> {
  const glpiId = parseGlpiId(ctx.params);
  if (!glpiId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      patch.name = body.name;
    }
    if (typeof body.content === "string") {
      patch.content = body.content;
    }
    if (body.statusId !== undefined && body.statusId !== null && body.statusId !== "") {
      const n = Number(body.statusId);
      if (Number.isFinite(n)) {
        patch.status = n;
      }
    }
    if (body.priorityId !== undefined && body.priorityId !== null && body.priorityId !== "") {
      const n = Number(body.priorityId);
      if (Number.isFinite(n)) {
        patch.priority = n;
      }
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
    }
    await patchGlpiTicketJson(glpiId, patch);
    const fresh = await fetchGlpiTicketJson(glpiId);
    await persistTicketFromRaw(fresh);
    const norm = normalizeTicket(fresh);
    await loadAndPersistWaitingParty(glpiId, norm.status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ error: toErrorLog(error) }, "Falha ao atualizar ticket no GLPI");
    return NextResponse.json(
      { error: "Falha ao atualizar chamado no GLPI", detail: toErrorLog(error).message },
      { status: 500 }
    );
  }
}
