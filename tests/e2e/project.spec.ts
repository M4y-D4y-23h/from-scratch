import { expect, type Page, test } from "@playwright/test";

/*
 * Aceite da Fase 3 (SPEC B.18): "consigo abrir um build de referência e ver custos, dificuldade,
 * locais, alertas e cálculos, e trocar uma peça com revalidação". Roda no servidor isolado dos
 * testes (cópia do catálogo e banco temporários): os projetos criados aqui somem no fim.
 */

// A primeira visita compila a página no `next dev`; no Windows do CI isso pode demorar.
test.describe.configure({ timeout: 180_000 });

function collectErrors(page: Page): string[] {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(e.message));
  return erros;
}

const resumo = (page: Page) => page.getByRole("region", { name: "Resumo" });

/**
 * Um dos totais de "Quanto custa" (Peças, Ferramentas...). Cada teste compara só o total que ele
 * mexe: os testes rodam em paralelo e o "já tenho" vale para todos os projetos.
 */
async function totalDe(page: Page, rotulo: string): Promise<string> {
  const caixa = page
    .getByRole("region", { name: "Quanto custa" })
    .locator("div")
    .filter({ has: page.getByText(rotulo, { exact: true }) })
    .last();
  return (await caixa.locator("dd").first().innerText()).trim();
}

test.describe("painéis do build de referência", () => {
  test("as 6 abas mostram custos, dificuldade, locais, montagem, alertas e cálculos", async ({
    page,
  }, testInfo) => {
    const erros = collectErrors(page);
    await page.goto("/referencia/a1-gps-filmagem/economica");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Drone com GPS para filmar e aprender",
    );
    await expect(resumo(page).getByRole("status")).toContainText("Peças compatíveis");

    const abas: Array<[string, RegExp | string]> = [
      ["Peças e Custos", "Quanto custa"],
      ["Dificuldade", "Dificuldade geral"],
      ["Onde fazer", "Onde fazer cada coisa"],
      ["Montagem", "Guia de montagem"],
      ["Segurança", /Riscos e regras/],
      ["Cálculos", "Os números do projeto"],
    ];
    for (const [aba, titulo] of abas) {
      await page.getByRole("tab", { name: aba }).click();
      const painel = page.getByRole("tabpanel");
      await expect(painel.getByRole("heading", { name: titulo }).first()).toBeVisible();
      const png = await page.screenshot({
        path: testInfo.outputPath(`referencia-a1-${aba}.png`),
        fullPage: false,
      });
      await testInfo.attach(`referencia-a1-${aba}`, { body: png, contentType: "image/png" });
    }

    // Conteúdo mínimo de cada aba (o que o aceite pede).
    await page.getByRole("tab", { name: "Peças e Custos" }).click();
    const totais = page.getByRole("region", { name: "Quanto custa" });
    for (const total of [
      "Peças",
      "Ferramentas",
      "Consumíveis",
      "EPI",
      "Importação estimada",
      "Total geral",
    ]) {
      await expect(totais.getByText(total, { exact: true })).toBeVisible();
    }
    // O total avisa o que ficou de fora por falta de preço (no A1: toalha, extintor e kit de
    // primeiros socorros), aqui e no resumo.
    await expect(totais).toContainText(/\+ \d+ itens? sem preço/);
    await expect(resumo(page)).toContainText(/\+ \d+ itens? sem preço/);
    await expect(page.getByRole("link", { name: /Mercado Livre/ }).first()).toHaveAttribute(
      "href",
      /^https:\/\/lista\.mercadolivre\.com\.br\//,
    );

    await page.getByRole("tab", { name: "Onde fazer" }).click();
    await expect(page.getByRole("heading", { name: "Espaço aberto" })).toBeVisible();

    await page.getByRole("tab", { name: "Segurança" }).click();
    await expect(page.getByText("Baterias LiPo podem pegar fogo")).toBeVisible();

    await page.getByRole("tab", { name: "Cálculos" }).click();
    await expect(page.getByText(/Regras de compatibilidade/)).toBeVisible();
    await expect(page.getByText("Por que a classe 450 mm?", { exact: false })).toBeVisible();

    // A aba fica no endereço (dá para voltar a ela).
    await expect(page).toHaveURL(/aba=calculos/);
    expect(erros).toEqual([]);
  });

  test("termo do glossário abre a explicação num balão", async ({ page }) => {
    await page.goto("/referencia/a1-gps-filmagem/economica?aba=seguranca");
    await page.getByRole("button", { name: "LiPo", exact: true }).first().click();
    const balao = page.getByRole("dialog");
    await expect(balao).toContainText("polímero de lítio");
    await expect(balao.getByRole("link", { name: "Ver no glossário" })).toHaveAttribute(
      "href",
      "/glossario#lipo",
    );
  });

  test("'já tenho esta ferramenta' tira a ferramenta do custo e dá para desmarcar", async ({
    page,
  }) => {
    await page.goto("/referencia/a3-tiny-whoop/equilibrada");
    const antes = await totalDe(page, "Ferramentas");
    // A primeira caixa da lista é de uma ferramenta (tipo "ferramenta").
    const caixa = page.getByLabel(/^Já tenho: /).first();
    await caixa.check();
    await expect(page.getByRole("status").filter({ hasText: "já tenho" })).toBeVisible();
    await expect.poll(() => totalDe(page, "Ferramentas")).not.toBe(antes);
    await caixa.uncheck();
    await expect.poll(() => totalDe(page, "Ferramentas")).toBe(antes);
  });
});

test.describe("trocar peça com revalidação", () => {
  test("trocar a FC cria o projeto (versão 2), com tudo recalculado; histórico e apagar", async ({
    page,
  }) => {
    const erros = collectErrors(page);
    await page.goto("/referencia/a1-gps-filmagem/economica");
    const antes = await totalDe(page, "Peças");

    await page.getByRole("button", { name: "Trocar Controladora de voo (FC)" }).click();
    const dialogo = page.getByRole("dialog", { name: /Trocar: Controladora de voo/ });
    await expect(dialogo).toContainText("Só aparecem peças do catálogo que passam");
    await expect(dialogo).toContainText("Custo das peças");
    await dialogo.getByRole("button", { name: "Usar esta peça" }).first().click();

    await expect(page).toHaveURL(/\/projetos\/[0-9a-f-]+\?aba=pecas/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Meu projeto: Drone com GPS para filmar e aprender",
    );
    await expect(page.getByText("Versão 2 (atual)", { exact: true })).toBeVisible();
    await expect(page.getByText(/Troca de peça: Controladora de voo \(FC\)/)).toBeVisible();
    await expect(resumo(page).getByRole("status")).toContainText("Peças compatíveis");
    expect(await totalDe(page, "Peças")).not.toBe(antes);

    // Ver a versão 1 e voltar para ela: vira a versão 3 (o histórico não se perde).
    await page.getByRole("link", { name: "Ver esta versão" }).click();
    await expect(page.getByText("Você está vendo a")).toBeVisible();
    await page.getByRole("button", { name: "Voltar para esta versão" }).click();
    await expect(page.getByText("Voltou para a versão 1")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Versão 3 (atual)", { exact: true })).toBeVisible();
    await expect.poll(() => totalDe(page, "Peças")).toBe(antes);

    // Apagar pede confirmação e volta para o início.
    await page.getByRole("button", { name: "Apagar o projeto" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Apagar" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
    expect(erros).toEqual([]);
  });

  test("peça que não serve sozinha: a troca combinada do whoop (frame + hélice + motor)", async ({
    page,
  }) => {
    await page.goto("/referencia/a3-tiny-whoop/economica");
    await page.getByRole("button", { name: "Trocar Frame com dutos" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Nenhuma outra peça do catálogo serve aqui sozinha");
    await expect(dialogo).toContainText("Serve se você trocar também");
    await dialogo.getByRole("button", { name: /Trocar as 3 peças/ }).click();
    await expect(page).toHaveURL(/\/projetos\//, { timeout: 60_000 });
    await expect(resumo(page).getByRole("status")).toContainText("Peças compatíveis");
    await expect(page.getByText(/Frame com dutos: BETAFPV Air65 II/)).toBeVisible();
  });
});
