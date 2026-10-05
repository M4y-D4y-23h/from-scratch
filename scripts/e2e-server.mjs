/*
 * Servidor dos testes no navegador (pnpm test:e2e), isolado dos seus dados (ADR-0025):
 * - uma CÓPIA do catálogo numa pasta temporária (os testes editam preços e selos);
 * - um banco temporário (os testes criam projetos);
 * - porta 3100 e pasta de build própria (.next-e2e), para rodar junto com o seu `pnpm dev`.
 * Ao terminar, a pasta temporária é apagada. Funciona igual no Windows e no Linux.
 */
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaria = mkdtempSync(path.join(tmpdir(), "from-scratch-e2e-"));
const catalogo = path.join(temporaria, "catalogo");
cpSync(path.join(raiz, "data", "catalog", "drone"), catalogo, { recursive: true });

const porta = process.env.E2E_PORT ?? "3100";
const next = require.resolve("next/dist/bin/next", { paths: [raiz] });
const filho = spawn(process.execPath, [next, "dev", "-H", "127.0.0.1", "-p", porta], {
  cwd: raiz,
  stdio: "inherit",
  env: {
    ...process.env,
    FROM_SCRATCH_CATALOG_DIR: catalogo,
    FROM_SCRATCH_DB: path.join(temporaria, "e2e.db"),
    FROM_SCRATCH_NEXT_DIST: ".next-e2e",
    NEXT_TELEMETRY_DISABLED: "1",
  },
});

let limpo = false;
function limpar() {
  if (limpo) return;
  limpo = true;
  try {
    rmSync(temporaria, { recursive: true, force: true });
  } catch {
    // No Windows o banco pode ficar preso por alguns instantes; a pasta é temporária mesmo.
  }
}

for (const sinal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sinal, () => {
    filho.kill(sinal);
  });
}
filho.on("exit", (codigo) => {
  limpar();
  process.exit(codigo ?? 0);
});
