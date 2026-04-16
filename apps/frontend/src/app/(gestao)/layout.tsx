import { PropsWithChildren } from "react";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Rotas de gestão contratual com shell comum. O Kanban GLPI fica em /operacao/glpi (fora deste grupo)
 * para não envolver o HTML completo do servidor Node dentro do layout React.
 */
export default function GestaoLayout({ children }: PropsWithChildren): JSX.Element {
  return <AppShell>{children}</AppShell>;
}
