import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Os testes no navegador usam uma pasta de build própria (scripts/e2e-server.mjs), para rodar
  // ao mesmo tempo que o seu `pnpm dev` sem um atrapalhar o outro.
  distDir: process.env.FROM_SCRATCH_NEXT_DIST || ".next",
  // ...e um tsconfig próprio, para o Next não mexer no tsconfig.json ao achar a pasta nova.
  typescript: {
    tsconfigPath: process.env.FROM_SCRATCH_NEXT_DIST ? "tsconfig.e2e.json" : "tsconfig.json",
  },
  // Links internos (<Link href>) são checados pelo TypeScript: um erro de
  // digitação em uma rota vira erro de compilação, não página 404.
  typedRoutes: true,
};

export default nextConfig;
