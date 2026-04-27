import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import { jwtSecretBytes } from "@/lib/jwt-config";
import { publicAbsoluteUrl } from "@/lib/public-site-url";

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
  "/projetos",
  "/trocar-senha",
  "/manual"
];

function needsAuth(pathname: string): boolean {
  return gestaoPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

async function mustChangePassword(token: string): Promise<boolean> {
  const { payload } = await jwtVerify(token, jwtSecretBytes(), { algorithms: ["HS256"] });
  return payload.mustChangePassword === true;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/operacao/glpi")) {
    return NextResponse.redirect(publicAbsoluteUrl(request, "/chamados"));
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

  const token = request.cookies.get(GTI_TOKEN_COOKIE)?.value;
  if (needsAuth(pathname) && !token) {
    const url = publicAbsoluteUrl(request, "/login");
    url.searchParams.set("returnUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (needsAuth(pathname) && token) {
    try {
      if (await mustChangePassword(token)) {
        if (pathname === "/trocar-senha") {
          return NextResponse.next();
        }
        const url = publicAbsoluteUrl(request, "/trocar-senha");
        url.searchParams.set("returnUrl", pathname);
        return NextResponse.redirect(url);
      }
    } catch {
      const url = publicAbsoluteUrl(request, "/login");
      url.searchParams.set("returnUrl", pathname);
      const res = NextResponse.redirect(url);
      res.cookies.set(GTI_TOKEN_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax" });
      return res;
    }
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
    "/trocar-senha",
    "/manual",
    "/manual/:path*",
    "/operacao/glpi",
    "/operacao/glpi/:path*"
  ]
};
