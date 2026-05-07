import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Isso força o Turbopack a não tentar compilar o Prisma como código de borda
    serverComponentsExternalPackages: ['@prisma/client'],
  },
  // Se estiver usando Next 15/16, use esta também por segurança:
  serverExternalPackages: ['@prisma/client'], 
};

export default nextConfig;