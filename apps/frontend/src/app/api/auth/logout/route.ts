import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import { jwtSecretBytes } from "@/lib/jwt-config";
import { publicAbsoluteUrl } from "@/lib/public-site-url";
import { gestaoUserAccess } from "@/server/gestao/gestao-services";

function requestIp(req: Request): string | null {
  const raw = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  return raw?.split(",")[0]?.trim() || null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(GTI_TOKEN_COOKIE)?.value?.trim() || "";
  if (token) {
    try {
      const { payload } = await jwtVerify(token, jwtSecretBytes());
      const userId = typeof payload.sub === "string" ? payload.sub : "";
      const email = typeof payload.email === "string" ? payload.email : "";
      const role = payload.role as UserRole | undefined;
      if (userId && email && role) {
        void gestaoUserAccess
          .record({
            actor: { userId, email, role },
            eventType: "LOGOUT",
            path: "/logout",
            pathLabel: "Logout",
            ipAddress: requestIp(req),
            userAgent: req.headers.get("user-agent")
          })
          .catch((err) => console.warn("[user-access] falha ao registrar logout", err));
      }
    } catch {
      // Token inválido/expirado: apenas limpa o cookie.
    }
  }

  const url = publicAbsoluteUrl(req, "/login");
  const res = NextResponse.redirect(url);
  res.cookies.set(GTI_TOKEN_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax" });
  return res;
}
