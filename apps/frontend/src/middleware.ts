import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Ligações antigas `/operacao/glpi/*` passam a `/chamados` (mantém query string). */
export function middleware(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/chamados";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/operacao/glpi", "/operacao/glpi/:path*"]
};
