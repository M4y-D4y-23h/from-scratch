import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);

// Opcional: caminho de um Chromium já instalado. Normalmente fica vazio e o
// Playwright usa o navegador que ele mesmo baixa (pnpm test:e2e:install).
// Útil em ambientes sem acesso para baixar navegadores (ex.: contêineres de CI).
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    locale: "pt-BR",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: chromiumExecutable ? { executablePath: chromiumExecutable } : {},
      },
    },
  ],
  // Sobe o app sozinho antes dos testes. Se você já estiver com `pnpm dev`
  // aberto na porta 3000, ele reaproveita (fora do CI).
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
