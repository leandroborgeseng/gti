import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/**
 * Manifesto Web App (PWA — fase 1: instalação e identidade; service worker depois).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.displayTitle,
    short_name: BRAND.shortName,
    description: BRAND.description,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#1e3a8a",
    lang: "pt-BR",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
