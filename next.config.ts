import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Links internos (<Link href>) são checados pelo TypeScript: um erro de
  // digitação em uma rota vira erro de compilação, não página 404.
  typedRoutes: true,
};

export default nextConfig;
