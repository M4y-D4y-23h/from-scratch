import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mesmo atalho do tsconfig.json: "@/..." aponta para "src/...".
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Testes de unidade rodam em Node puro: o domínio não usa navegador.
    environment: "node",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    // E2E é do Playwright (pnpm test:e2e), não do Vitest.
    exclude: ["**/node_modules/**", "tests/e2e/**"],
  },
});
