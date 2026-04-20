import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    /** Código em `apps/backend` resolve `bcrypt` para o `node_modules` do backend e o webpack puxa `node-pre-gyp`. */
    if (isServer) {
      const nm = path.join(__dirname, "node_modules");
      config.resolve.alias = {
        ...config.resolve.alias,
        bcrypt: path.join(nm, "bcrypt"),
        /** Importados desde `apps/backend/src` (externalDir); na imagem Docker não há `apps/backend/node_modules`. */
        "@nestjs/common": path.join(nm, "@nestjs", "common"),
      };
      config.resolve.modules = [nm, ...(config.resolve.modules ?? ["node_modules"])];
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
