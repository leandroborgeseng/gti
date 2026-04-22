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
