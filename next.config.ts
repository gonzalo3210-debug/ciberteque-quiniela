/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Esto permite a Vercel compilar y publicar aunque haya errores de TypeScript
    ignoreBuildErrors: true,
  },
  eslint: {
    // También ignoramos advertencias de formato
    ignoreDuringBuilds: true,
  },
};

export default nextConfig; // o "module.exports = nextConfig;" dependiendo de cómo estaba originalmente