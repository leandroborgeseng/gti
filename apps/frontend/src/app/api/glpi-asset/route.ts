import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/glpi/config/logger";
import { toErrorLog } from "@/glpi/errors";
import { glpiClient } from "@/glpi/services/glpi.client";
import { resolveGlpiAssetUrl } from "@/glpi/glpi-asset-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rawUrl = (req.nextUrl.searchParams.get("url") || "").trim();
  const assetUrl = resolveGlpiAssetUrl(rawUrl);
  if (!assetUrl) {
    return NextResponse.json({ error: "URL de anexo/figura inválida" }, { status: 400 });
  }
  try {
    const glpiRes = await glpiClient.get<ArrayBuffer>(assetUrl, {
      responseType: "arraybuffer",
      validateStatus: () => true
    });
    if (glpiRes.status < 200 || glpiRes.status >= 300 || !glpiRes.data) {
      const body = typeof glpiRes.data === "string" ? glpiRes.data : "";
      return NextResponse.json({ error: "Falha ao carregar anexo do GLPI", detail: body }, { status: glpiRes.status || 502 });
    }
    const contentType = String(glpiRes.headers?.["content-type"] || "application/octet-stream");
    const contentDisposition = glpiRes.headers?.["content-disposition"];
    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300"
    });
    if (contentDisposition) {
      headers.set("Content-Disposition", String(contentDisposition));
    }
    return new NextResponse(Buffer.from(glpiRes.data), { status: 200, headers });
  } catch (error) {
    logger.error({ error: toErrorLog(error), assetUrl }, "Falha no proxy de anexo GLPI");
    return NextResponse.json({ error: "Falha ao carregar anexo/figura do GLPI" }, { status: 500 });
  }
}
