import "./globals.css";
import { PropsWithChildren } from "react";
import { AppShell } from "@/components/layout/app-shell";

export const metadata = {
  title: "Gestão de Contratos Públicos",
  description: "Módulo completo de controle contratual, medição e glosas."
};

export default function RootLayout({ children }: PropsWithChildren): JSX.Element {
  return (
    <html lang="pt-BR">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
