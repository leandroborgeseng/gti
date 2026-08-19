import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import { jwtSecretBytes } from "@/lib/jwt-config";
import { publicAbsoluteUrl } from "@/lib/public-site-url";

const gestaoPrefixes = [
  "/dashboard",
  "/resumo-operacional",
  "/minhas-atribuicoes",
  "/contracts",
  "/measurements",
  "/glosas",
  "/governance",
  "/goals",
  "/suppliers",
  "/fiscais",
  "/reports",
  "/users",
  "/administracao",
  "/modulos",
  "/backup",
  "/perfil",
  "/exports",
  "/projetos",
  "/trocar-senha",
  "/manual",
  "/notas-versao",
  "/prazos-pendencias",
  "/externo"
];

/** APIs liberadas mesmo com troca obrigatória pendente. */
const API_ALLOWED_WHILE_MUST_CHANGE = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/change-password",
  "/api/auth/register",
  "/api/auth/register-options",
  "/api/auth/password-reset",
  "/api/health",
  "/api/deploy-info"
];

function needsAuth(pathname: string): boolean {
  return gestaoPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isApiAllowedWhileMustChange(pathname: string): boolean {
  return API_ALLOWED_WHILE_MUST_CHANGE.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

async function readMustChangePassword(token: string): Promise<boolean> {
  const { payload } = await jwtVerify(token, jwtSecretBytes(), { algorithms: ["HS256"] });
  return payload.mustChangePassword === true;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/operacao/glpi")) {
    return NextResponse.redirect(publicAbsoluteUrl(request, "/chamados"));
  }

  // APIs: bloqueia uso geral enquanto a troca obrigatória estiver pendente.
  if (pathname.startsWith("/api/")) {
    if (isApiAllowedWhileMustChange(pathname)) {
      return NextResponse.next();
    }
    const apiToken = request.cookies.get(GTI_TOKEN_COOKIE)?.value;
    if (apiToken) {
      try {
        if (await readMustChangePassword(apiToken)) {
          return NextResponse.json(
            {
              error:
                "É necessário definir uma nova senha antes de continuar. Acesse /trocar-senha."
            },
            { status: 403 }
          );
        }
      } catch {
        // Token inválido: deixa a rota tratar 401 normalmente.
      }
    }
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/chamados") ||
    pathname.startsWith("/solicitar-acesso") ||
    pathname.startsWith("/recuperar-senha") ||
    pathname.startsWith("/resetar-senha") ||
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
      if (await readMustChangePassword(token)) {
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
    "/api/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/resumo-operacional",
    "/resumo-operacional/:path*",
    "/minhas-atribuicoes",
    "/minhas-atribuicoes/:path*",
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
    "/administracao",
    "/administracao/:path*",
    "/modulos",
    "/modulos/:path*",
    "/backup",
    "/backup/:path*",
    "/perfil",
    "/perfil/:path*",
    "/exports",
    "/exports/:path*",
    "/projetos",
    "/projetos/:path*",
    "/trocar-senha",
    "/manual",
    "/manual/:path*",
    "/notas-versao",
    "/notas-versao/:path*",
    "/prazos-pendencias",
    "/prazos-pendencias/:path*",
    "/externo",
    "/externo/:path*",
    "/operacao/glpi",
    "/operacao/glpi/:path*"
  ]
};
