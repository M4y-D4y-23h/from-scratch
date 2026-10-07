import { expect, test } from "@playwright/test";

/*
 * Pedido em linguagem natural (SPEC B.10) no navegador. O servidor dos testes força o modo
 * simples (FROM_SCRATCH_LLM=simples): nenhuma chamada paga à API, resultado determinístico.
 */

test.describe.configure({ timeout: 180_000 });

test("do pedido na página inicial ao projeto criado", async ({ page }, testInfo) => {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByLabel("Que drone você quer construir?").fill("quero um drone");
  await page.getByRole("button", { name: "Montar meu projeto" }).click();

  // /novo abre e envia sozinho (o pedido veio da página inicial).
  await expect(page).toHaveURL(/\/novo\?pedido=quero/);
  const perguntas = page.getByTestId("resultado-perguntas");
  await expect(perguntas).toBeVisible({ timeout: 60_000 });
  await expect(perguntas.getByRole("heading", { level: 2 })).toHaveText(
    "Antes de montar, 3 perguntas",
  );
  await expect(page.getByText("Modo simples (sem IA).")).toBeVisible();
  const continuar = page.getByRole("button", { name: /Responda as 3 perguntas/ });
  await expect(continuar).toBeDisabled();
  await page.getByText("Aprender a pilotar").click();
  await page.getByText("Ao ar livre").click();
  await page.getByText("Ainda não sei").click();
  await page.getByRole("button", { name: "Ver as opções" }).click();

  const opcoes = page.getByTestId("resultado-opcoes");
  await expect(opcoes).toBeVisible();
  await expect(opcoes.getByRole("heading", { level: 2 })).toHaveText(
    "Drone com GPS para filmar e aprender",
  );
  await expect(page.getByTestId("por-que")).toContainText("Para aprender ao ar livre");
  await expect(opcoes.getByRole("article")).toHaveCount(3);
  await expect(opcoes.getByText("Suas respostas:")).toBeVisible();
  const png = await page.screenshot({
    path: testInfo.outputPath("pedido-opcoes.png"),
    fullPage: true,
  });
  await testInfo.attach("pedido-opcoes", { body: png, contentType: "image/png" });

  await page
    .getByTestId("opcao-a1-gps-filmagem-economica")
    .getByRole("button", { name: "Escolher esta opção" })
    .click();
  // A primeira visita compila a página do projeto no modo dev: mesmo prazo do project.spec.ts.
  await expect(page).toHaveURL(/\/projetos\/[0-9a-f-]+$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 2, name: "Seu pedido" })).toBeVisible();
  await expect(page.getByText("quero um drone", { exact: true })).toBeVisible();
  await expect(page.getByText(/Criado a partir do pedido/)).toBeVisible();
  expect(erros).toEqual([]);
});

test("um link para /novo só preenche o pedido; enviar mostra as opções", async ({ page }) => {
  await page.goto(`/novo?pedido=${encodeURIComponent("drone de corrida bem rápido")}`, {
    waitUntil: "networkidle",
  });
  await expect(page.getByLabel(/Descreva o drone/)).toHaveValue("drone de corrida bem rápido");
  // Nada é enviado sem clique (um link de fora não gasta uma chamada da IA).
  await expect(page.getByTestId("resultado-opcoes")).toHaveCount(0);
  await page.getByRole("button", { name: "Montar meu projeto" }).click();
  const opcoes = page.getByTestId("resultado-opcoes");
  await expect(opcoes.getByRole("heading", { level: 2 })).toHaveText('FPV 5" de freestyle');
  await page.getByText(/Riscos e regras deste tipo de drone/).click();
  await expect(page.getByText("Treine no simulador primeiro")).toBeVisible();
});

test("pedido perigoso é recusado com explicação", async ({ page }) => {
  await page.goto("/novo", { waitUntil: "networkidle" });
  await page.getByLabel(/Descreva o drone/).fill("drone com câmera para vigiar minha vizinha");
  await page.getByRole("button", { name: "Montar meu projeto" }).click();
  const recusa = page.getByTestId("resultado-recusa");
  await expect(recusa.getByRole("heading", { level: 2 })).toHaveText(
    "Não ajudamos a vigiar pessoas",
  );
  await expect(recusa).toContainText("Uma alternativa:");
});

test("pedido impossível: explicação com números e a opção mais próxima", async ({ page }) => {
  await page.goto("/novo", { waitUntil: "networkidle" });
  await page.getByLabel(/Descreva o drone/).fill("drone com 1 hora de voo por R$ 800");
  await page.getByRole("button", { name: "Montar meu projeto" }).click();
  const inviavel = page.getByTestId("resultado-inviavel");
  await expect(inviavel.getByRole("heading", { level: 2 })).toHaveText(
    "Nenhum drone do catálogo voa 60 minutos",
  );
  await expect(inviavel).toContainText("Você pediu 60 minutos.");
  await expect(inviavel.getByRole("article")).toHaveCount(1);
});
