import { readFile } from "node:fs/promises";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/glpi/config/prisma";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import {
  existsSync,
  resolveAttachmentAbsolute,
  safeAttachmentFilename
} from "@/lib/attachment-storage";
import { verifyBearerToken } from "@/lib/verify-bearer-session";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const token = cookies().get(GTI_TOKEN_COOKIE)?.value;
  if (!token) {
    return new NextResponse("Não autenticado", { status: 401 });
  }
  let session: Awaited<ReturnType<typeof verifyBearerToken>>;
  try {
    session = await verifyBearerToken(token);
  } catch {
    return new NextResponse("Sessão inválida", { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || user.email !== session.email) {
    return new NextResponse("Sessão inválida", { status: 401 });
  }

  const id = params.id;
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att) {
    return new NextResponse("Anexo não encontrado", { status: 404 });
  }
  let abs: string;
  try {
    abs = resolveAttachmentAbsolute(att.filePath);
  } catch {
    return new NextResponse("Caminho de arquivo inválido", { status: 400 });
  }
  if (!existsSync(abs)) {
    return new NextResponse("Arquivo não existe no armazenamento", { status: 404 });
  }
  const buf = await readFile(abs);
  const res = new NextResponse(buf, { status: 200 });
  res.headers.set("content-type", att.mimeType);
  res.headers.set("content-disposition", `attachment; filename="${safeAttachmentFilename(att.fileName)}"`);
  return res;
}
