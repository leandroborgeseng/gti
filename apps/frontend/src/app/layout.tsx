import "./globals.css";
import type { Metadata, Viewport } from "next";
import { PropsWithChildren } from "react";
import { AppProviders } from "@/components/providers/app-providers";
import { BRAND } from "@/lib/brand";

function metadataBaseUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3001");
  }
}

export const viewport: Viewport = {
  themeColor: "#1e3a8a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5
};

export const metadata: Metadata = {
  metadataBase: metadataBaseUrl(),
  applicationName: BRAND.shortName,
  title: { default: BRAND.displayTitle, template: BRAND.titleTemplate },
  description: BRAND.description,
  appleWebApp: {
    capable: true,
    title: BRAND.shortName,
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
