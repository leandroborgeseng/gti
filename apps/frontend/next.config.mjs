/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true
  },
  /**
   * Encaminha APIs do servidor GLPI (Node) para o mesmo host na app Next.
   * GLPI_SYNC_ORIGIN deve estar definido em runtime (ex.: Railway antes do build e do start).
   * PWA fase seguinte: service worker (ex. Serwist) sem cache agressivo de /api/glpi.
   */
  async rewrites() {
    const g = (process.env.GLPI_SYNC_ORIGIN || "").trim().replace(/\/+$/, "");
    if (!g) return [];
    return [
      { source: "/api/kanban", destination: `${g}/api/kanban` },
      { source: "/api/settings/sync-scope", destination: `${g}/api/settings/sync-scope` },
      { source: "/api/tickets/recalc-pendencia", destination: `${g}/api/tickets/recalc-pendencia` },
      { source: "/api/tickets/glpi/:path*", destination: `${g}/api/tickets/glpi/:path*` },
      { source: "/api/glpi-asset", destination: `${g}/api/glpi-asset` }
    ];
  }
};

export default nextConfig;
