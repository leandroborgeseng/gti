/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /** Desligado: em alguns builds o gerador de tipos referencia ficheiros em `.next/types` de forma inconsistente. */
    typedRoutes: false
  }
};

export default nextConfig;
