import { expect, type Locator, type Page, test } from "@playwright/test";

/*
 * Guia de montagem (SPEC B.13) e aceite da Fase 5: "percorro um projeto do passo 1 ao final, com
 * o progresso salvo". Os checklists de segurança (SPEC B.9) precisam ser confirmados para avançar.
 */

test.describe.configure({ timeout: 240_000 });

function collectErrors(page: Page): string[] {
  const erros: string[] = [];
  page.on("console", (m) => {
    // O navegador pede /favicon.ico sozinho; o app usa o icon.svg.
    if (m.type() === "error" && !m.location().url.endsWith("/favicon.ico")) erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(e.message));
  return erros;
}

const passoAtual = (page: Page) => page.getByTestId("passo-atual");

async function idDoPasso(passo: Locator): Promise<string> {
  return (await passo.locator("h3").getAttribute("id")) ?? "";
}

/** Confirma o checklist (se houver) e marca o passo aberto como feito. Devolve false no último. */
async function fazerPasso(page: Page): Promise<boolean> {
  const passo = passoAtual(page);
  const id = await idDoPasso(passo);
  const caixas = passo.locator("fieldset input[type=checkbox]");
  if ((await caixas.count()) > 0) {
    const feito = passo.getByRole("button", { name: /^Feito/ });
    // Sem o checklist, o passo não pode ser marcado.
    await expect(feito).toBeDisabled();
    for (const caixa of await caixas.all()) await caixa.check();
    await passo.getByRole("button", { name: "Confirmar o checklist" }).click();
    await expect(passo.getByText(/Checklist confirmado/)).toBeVisible();
  }
  const feito = passo.getByRole("button", { name: /^Feito/ });
  const ultimo = (await feito.innerText()).trim() === "Feito";
  await feito.click();
  if (ultimo) {
    await expect(passo.getByRole("button", { name: "Desfazer" })).toBeVisible();
    return false;
  }
  await expect.poll(() => idDoPasso(passoAtual(page))).not.toBe(id);
  return true;
}

test("percorre o Tiny Whoop do passo 1 ao fim, com o progresso salvo", async ({
  page,
}, testInfo) => {
  const erros = collectErrors(page);
  await page.goto("/referencia/a3-tiny-whoop/economica?aba=montagem", { waitUntil: "networkidle" });
  // No drone de referência o guia é só leitura.
  await expect(passoAtual(page).getByRole("button", { name: /^Feito/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Começar a montar" }).click();
  await expect(page).toHaveURL(/\/projetos\/[0-9a-f-]+\?aba=montagem/, { timeout: 60_000 });
  const progresso = page.getByTestId("progresso-guia");
  await expect(progresso).toContainText("0 de 25 passos feitos");
  const endereco = page.url().split("?")[0] ?? "";

  let feitos = 0;
  let recarregou = false;
  for (;;) {
    const continua = await fazerPasso(page);
    feitos += 1;
    // As peças do passo aberto aparecem destacadas no 3D.
    if (feitos === 5) {
      const titulo = (await passoAtual(page).locator("h3").innerText()).replace(
        /\s*\(pendente\)$/,
        "",
      );
      await expect(page.getByText(`Destacando: Passo: ${titulo}`)).toBeVisible();
    }
    // No meio do caminho, recarrega: o progresso continua lá e o guia abre onde parou.
    if (feitos === 12 && !recarregou) {
      recarregou = true;
      await page.goto(`${endereco}?aba=montagem`, { waitUntil: "networkidle" });
      await expect(progresso).toContainText("12 de 25 passos feitos");
      await expect(passoAtual(page)).toContainText("Passo 13 de 26");
      await expect(page.getByRole("tab", { name: /Montagem/ })).toContainText("12/25");
    }
    if (!continua) break;
  }
  await expect(progresso).toContainText("25 de 25 passos feitos (100%)");
  await expect(page.getByText("Guia concluído!")).toBeVisible();
  const png = await page.screenshot({ path: testInfo.outputPath("guia-concluido.png") });
  await testInfo.attach("guia-concluido", { body: png, contentType: "image/png" });

  // Recarregando, continua concluído; e a página inicial mostra o progresso.
  await page.goto(`${endereco}?aba=montagem`, { waitUntil: "networkidle" });
  await expect(page.getByText("Guia concluído!")).toBeVisible();
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText(/guia: 2[56] passos feitos/).first()).toBeVisible();
  expect(erros).toEqual([]);
});

test("não dá para pular um passo crítico", async ({ page }) => {
  await page.goto("/referencia/a3-tiny-whoop/economica?aba=montagem", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Começar a montar" }).click();
  await expect(page).toHaveURL(/\/projetos\//, { timeout: 60_000 });
  const lista = page.getByRole("navigation", { name: "Todos os passos" });

  // Um passo depois da primeira ligação (checklist): bloqueado, com o atalho para o crítico.
  await lista.getByRole("button", { name: /Instalar as hélices/ }).click();
  const passo = passoAtual(page);
  await expect(passo).toContainText("termine antes o passo 11");
  await expect(passo.getByRole("button", { name: /^Feito/ })).toBeDisabled();
  await passo.getByRole("button", { name: "Ir para o passo 11" }).click();
  await expect(passoAtual(page).locator("h3")).toContainText("Primeira ligação, sem hélices");

  // O checklist só confirma com todos os itens marcados.
  const confirmar = passoAtual(page).getByRole("button", { name: /Marque os 3 itens/ });
  await expect(confirmar).toBeDisabled();
  await passoAtual(page).locator("fieldset input[type=checkbox]").first().check();
  await expect(passoAtual(page).getByRole("button", { name: /Marque os 3 itens/ })).toBeDisabled();
});
