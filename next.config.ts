import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tente esta abordagem alternativa se a anterior falhou
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
  // Mantenha esta também
  serverExternalPackages: ['@prisma/client'],
};

export default nextConfig;