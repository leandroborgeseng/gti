import type { MetadataRoute } from "next";

/**
 * Manifesto Web App (PWA — fase 1: instalação e identidade; service worker depois).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestão de Operações de TI",
    short_name: "Gestão TI",
    description: "Gestão de operações de TI, contratos, medições, glosas e acompanhamento de chamados GLPI.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#1faa00",
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
