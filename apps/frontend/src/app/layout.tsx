import "./globals.css";
import type { Metadata, Viewport } from "next";
import { PropsWithChildren } from "react";
import { AppProviders } from "@/components/providers/app-providers";

function metadataBaseUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3001");
  }
}

export const viewport: Viewport = {
  themeColor: "#1faa00",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5
};

export const metadata: Metadata = {
  metadataBase: metadataBaseUrl(),
  applicationName: "Gestão de Operações de TI",
  title: { default: "Gestão de Operações de TI", template: "%s · Gestão de Operações de TI" },
  description: "Gestão de operações de TI, contratos, medições, glosas e integração com chamados GLPI.",
  appleWebApp: {
    capable: true,
    title: "Gestão de Operações de TI",
    statusBarStyle: "default"
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    shortcut: [{ url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export default function RootLayout({ children }: PropsWithChildren): JSX.Element {
  return (
    <html lang="pt-BR">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
