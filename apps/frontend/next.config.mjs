import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    /** Código em `apps/backend` resolve `bcrypt` para o `node_modules` do backend e o webpack puxa `node-pre-gyp`. */
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        bcrypt: path.join(__dirname, "node_modules", "bcrypt"),
      };
    }
    return config;
  },
  experimental: {
    /** Desligado: em alguns builds o gerador de tipos referencia ficheiros em `.next/types` de forma inconsistente. */
    typedRoutes: false,
    /**
     * Next.js 14: sem isto, `instrumentation.ts` pode não ser executado — o arranque do GLPI
     * (`register` → `bootstrapGlpiSyncInNext`) nunca corre e o Kanban fica sem dados.
     */
    instrumentationHook: true,
    /** Importar serviços de gestão a partir de `apps/backend/src` (mesmo monorepo). */
    externalDir: true,
    serverComponentsExternalPackages: ["bcrypt"],
  },
};

export default nextConfig;
