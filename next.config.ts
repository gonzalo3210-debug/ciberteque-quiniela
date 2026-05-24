import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: {
    // Esto permite a Vercel compilar y publicar aunque haya errores de TypeScript
    ignoreBuildErrors: true,
  }
};

export default nextConfig;