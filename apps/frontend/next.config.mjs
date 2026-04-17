/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /** Desligado: em alguns builds o gerador de tipos referencia ficheiros em `.next/types` de forma inconsistente. */
    typedRoutes: false,
    /**
     * Next.js 14: sem isto, `instrumentation.ts` pode não ser executado — o arranque do GLPI
     * (`register` → `bootstrapGlpiSyncInNext`) nunca corre e o Kanban fica sem dados.
     */
    instrumentationHook: true
  }
};

export default nextConfig;
