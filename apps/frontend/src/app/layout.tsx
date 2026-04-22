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
  themeColor: "#0066B3",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5
};

export const metadata: Metadata = {
  metadataBase: metadataBaseUrl(),
  applicationName: "GTI",
  title: { default: "GTI — Gestão contratual", template: "%s · GTI" },
  description: "Controlo contratual, medição, glosas e integração com chamados GLPI.",
  appleWebApp: {
    capable: true,
    title: "GTI",
    statusBarStyle: "default"
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }]
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
