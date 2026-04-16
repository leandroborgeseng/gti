import { PropsWithChildren } from "react";
import { AppShell } from "@/components/layout/app-shell";

/** Rotas de gestão contratual com shell comum (inclui Kanban GLPI em `/chamados`). */
export default function GestaoLayout({ children }: PropsWithChildren): JSX.Element {
  return <AppShell>{children}</AppShell>;
}
