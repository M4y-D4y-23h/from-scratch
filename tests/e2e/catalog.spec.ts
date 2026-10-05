import { expect, test } from "@playwright/test";

/*
 * Página /catalogo (SPEC B.6): listar, filtrar, verificar com fonte e atualizar preço com data.
 * O servidor dos testes usa uma CÓPIA do catálogo (scripts/e2e-server.mjs): os arquivos do
 * repositório não mudam. Os testes rodam em série porque editam o mesmo catálogo.
 */

test.describe.configure({ mode: "serial", timeout: 180_000 });

const RABICHO = "/catalogo/componente/conector-xt60-rabicho";

test("lista e filtra o catálogo", async ({ page }) => {
  await page.goto("/catalogo");
  await expect(page.getByRole("heading", { level: 1, name: "Catálogo" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("45 de 45");
  await page.getByLabel("Buscar").fill("pixhawk");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByRole("status")).toHaveText("3 de 45");
  await expect(page.getByRole("rowheader", { name: /Pixhawk 6C Mini/ })).toBeVisible();
  await page.getByRole("link", { name: /Tabelas de empuxo/ }).click();
  await expect(page.getByRole("status")).toHaveText("4 de 4");
});

test("preço em R$ numa peça sem preço: o custo do projeto passa a incluí-la", async ({ page }) => {
  await page.goto("/referencia/a2-fpv-5pol/economica");
  const semPreco = page.getByText(/Sem preço pesquisado \(fora do total\)/);
  await expect(semPreco).toContainText("Rabicho XT60");

  await page.goto(RABICHO);
  await page.getByLabel(/Mínimo/).fill("12");
  await page.getByLabel("Máximo").fill("25");
  await page.getByRole("button", { name: "Salvar preço" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Preço salvo" })).toBeVisible();
  await expect(page.getByText(/R\$ 12 a R\$ 25 em/)).toBeVisible();

  await page.goto("/referencia/a2-fpv-5pol/economica");
  await expect(page.getByText(/Sem preço pesquisado \(fora do total\)/)).not.toContainText(
    "Rabicho XT60",
  );
});

test("verificar exige fonte com link e a confirmação; o selo vira ✅", async ({ page }) => {
  await page.goto(RABICHO);
  await page.getByLabel("Fonte que você conferiu").fill("Loja de teste: anúncio do rabicho XT60");
  await page.getByLabel("Link (https://)").fill("https://example.com/rabicho-xt60");
  await page.getByRole("button", { name: "Marcar como verificado" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Marque que conferiu" })).toBeVisible();
  // O que foi digitado continua lá para corrigir.
  await expect(page.getByLabel("Fonte que você conferiu")).toHaveValue(
    "Loja de teste: anúncio do rabicho XT60",
  );
  await page.getByLabel(/Conferi nesta fonte/).check();
  await page.getByRole("button", { name: "Marcar como verificado" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Marcado como verificado" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Verificado");
  await expect(
    page.getByRole("link", { name: /Loja de teste: anúncio do rabicho XT60/ }),
  ).toBeVisible();
});

test("JSON inválido ou que quebra o catálogo não é gravado", async ({ page }) => {
  await page.goto(RABICHO, { waitUntil: "networkidle" });
  const editor = page.getByLabel("JSON do item");
  await editor.fill("{ isto não é json");
  await page.getByRole("button", { name: "Validar e salvar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "não é um JSON válido" })).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  const original = JSON.parse(await editor.inputValue()) as Record<string, unknown>;
  await editor.fill(JSON.stringify({ ...original, massa_g: -3 }, null, 2));
  await page.getByRole("button", { name: "Validar e salvar" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "O catálogo não foi alterado" }),
  ).toContainText("massa_g");
});

test("câmbio e impostos de importação: parâmetro com data", async ({ page }) => {
  // Só a data da conferência muda: trocar o câmbio mexeria nos custos que os outros testes (em
  // paralelo) comparam. O efeito do câmbio nos custos é testado em src/server/catalog/write.test.ts.
  await page.goto("/catalogo/importacao", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Câmbio e impostos de importação",
  );
  await page.getByLabel("Regras conferidas em").fill("2026-10-05");
  await page.getByRole("button", { name: "Salvar parâmetros" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Parâmetros de importação salvos" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /conferidos em 05\/10\/2026/ })).toBeVisible();
});

test("glossário lista os termos com âncora", async ({ page }) => {
  await page.goto("/glossario#lipo");
  await expect(page.getByRole("heading", { level: 1, name: "Glossário" })).toBeVisible();
  await expect(page.locator("#lipo")).toContainText("polímero de lítio");
});
