import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";

export function GET(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const res = NextResponse.redirect(url);
  res.cookies.set(GTI_TOKEN_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax" });
  return res;
}
