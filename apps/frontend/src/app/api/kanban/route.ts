import { NextResponse } from "next/server";
import { mergeKanbanSettingsFromRequestBody, readKanbanSettings } from "@/glpi/kanban-settings";
import { logger } from "@/glpi/config/logger";
import { toErrorLog } from "@/glpi/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const settings = await readKanbanSettings();
    return NextResponse.json(settings);
  } catch (error) {
    logger.error({ error: toErrorLog(error) }, "Falha ao ler configuração do kanban");
    return NextResponse.json({ error: "Falha ao ler configuração do kanban" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();
    const next = await mergeKanbanSettingsFromRequestBody(body);
    return NextResponse.json(next);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("JSON")) {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    logger.error({ error: toErrorLog(error) }, "Falha ao salvar configuração do kanban");
    return NextResponse.json({ error: "Falha ao salvar configuração do kanban" }, { status: 500 });
  }
}
