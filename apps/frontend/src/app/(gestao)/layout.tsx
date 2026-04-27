import { PropsWithChildren } from "react";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import { jwtSecretBytes } from "@/lib/jwt-config";

async function readInitialRoleFromSession(): Promise<string | null> {
  const token = cookies().get(GTI_TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecretBytes());
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** Rotas de gestão contratual com shell comum (inclui Kanban GLPI em `/chamados`). */
export default async function GestaoLayout({ children }: PropsWithChildren): Promise<JSX.Element> {
  const initialRole = await readInitialRoleFromSession();
  return <AppShell initialRole={initialRole}>{children}</AppShell>;
}
