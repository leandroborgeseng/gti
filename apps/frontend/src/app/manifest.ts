import type { MetadataRoute } from "next";

/**
 * Manifesto Web App (PWA — fase 1: instalação e identidade; service worker depois).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GTI — Gestão contratual e GLPI",
    short_name: "GTI",
    description: "Gestão de contratos públicos, medições, glosas e acompanhamento de chamados GLPI.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    lang: "pt-BR",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };
}
