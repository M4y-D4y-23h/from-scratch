import { defineConfig, devices } from "@playwright/test";

// Servidor próprio dos testes (scripts/e2e-server.mjs): porta 3100, cópia temporária do catálogo e
// banco temporário. Os testes editam o catálogo e criam projetos sem tocar nos seus dados.
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;
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
        launchOptions: {
          // WebGL sem placa de vídeo (CI e contêineres): o Chromium usa o SwiftShader, que nas
          // versões novas precisa desta permissão explícita. Só vale para os testes.
          args: ["--enable-unsafe-swiftshader"],
          ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}),
        },
      },
    },
  ],
  // Sobe o app isolado antes dos testes. Nunca reaproveita um servidor aberto: um `pnpm dev` seu
  // usaria o catálogo e o banco de verdade.
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { E2E_PORT: String(PORT) },
  },
});
