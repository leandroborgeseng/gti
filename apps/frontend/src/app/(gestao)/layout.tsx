import { PropsWithChildren } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { getJwtRoleFromCookies } from "@/lib/session-role-server";

/** Rotas de gestão contratual com shell comum (inclui Kanban GLPI em `/chamados`). */
export default async function GestaoLayout({ children }: PropsWithChildren): Promise<JSX.Element> {
  const initialRole = await getJwtRoleFromCookies();
  return <AppShell initialRole={initialRole}>{children}</AppShell>;
}
