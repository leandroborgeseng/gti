import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";

const gestaoPrefixes = [
  "/dashboard",
  "/contracts",
  "/measurements",
  "/glosas",
  "/governance",
  "/goals",
  "/suppliers",
  "/fiscais",
  "/reports",
  "/users",
  "/exports",
  "/projetos"
];

function needsAuth(pathname: string): boolean {
  return gestaoPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/operacao/glpi")) {
    const url = request.nextUrl.clone();
    url.pathname = "/chamados";
    return NextResponse.redirect(url);
  }

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/chamados") ||
    pathname.startsWith("/api/") ||
    pathname === "/" ||
    pathname.startsWith("/health")
  ) {
    return NextResponse.next();
  }

  if (needsAuth(pathname) && !request.cookies.get(GTI_TOKEN_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("returnUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/contracts",
    "/contracts/:path*",
    "/measurements",
    "/measurements/:path*",
    "/glosas",
    "/glosas/:path*",
    "/governance",
    "/governance/:path*",
    "/goals",
    "/goals/:path*",
    "/suppliers",
    "/suppliers/:path*",
    "/fiscais",
    "/fiscais/:path*",
    "/reports",
    "/reports/:path*",
    "/users",
    "/users/:path*",
    "/exports",
    "/exports/:path*",
    "/projetos",
    "/projetos/:path*",
    "/operacao/glpi",
    "/operacao/glpi/:path*"
  ]
};
