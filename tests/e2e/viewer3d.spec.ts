import { expect, type Page, test } from "@playwright/test";

/*
 * Aceite da Fase 2 (SPEC B.18): o visualizador desenha os 3 arquétipos (com screenshot de cada
 * um, guardado no relatório e como artefato do CI) e trocar a hélice muda o modelo. Desde a
 * Fase 3 o 3D fica no centro da página do build de referência.
 */

const ARQUETIPOS = ["a1-gps-filmagem", "a2-fpv-5pol", "a3-tiny-whoop"] as const;

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

const regiao3d = (page: Page) => page.getByRole("region", { name: "Modelo 3D em escala real" });

async function openViewer(page: Page, url: string) {
  await page.goto(url);
  const viewer = page.getByTestId("visualizador-3d");
  await expect(viewer).toHaveAttribute("data-pronto", "sim", { timeout: 120_000 });
  return viewer;
}

/** Assinatura dos pixels do 3D (amostra reduzida): muda quando o desenho muda. */
async function canvasSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="visualizador-3d"] canvas');
    const copia = document.createElement("canvas");
    copia.width = 64;
    copia.height = 48;
    const ctx = copia.getContext("2d");
    if (!gl || !ctx) return "";
    ctx.drawImage(gl, 0, 0, copia.width, copia.height);
    return Array.from(ctx.getImageData(0, 0, copia.width, copia.height).data, (v) => v >> 5).join(
      "",
    );
  });
}

/** Quantas cores diferentes o 3D tem (amostra): um canvas em branco tem uma ou duas. */
async function distinctColors(page: Page): Promise<number> {
  return page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="visualizador-3d"] canvas');
    if (!gl) return 0;
    const copia = document.createElement("canvas");
    copia.width = 120;
    copia.height = 80;
    const ctx = copia.getContext("2d");
    if (!ctx) return 0;
    ctx.drawImage(gl, 0, 0, copia.width, copia.height);
    const { data } = ctx.getImageData(0, 0, copia.width, copia.height);
    const cores = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      cores.add(`${data[i]! >> 4}-${data[i + 1]! >> 4}-${data[i + 2]! >> 4}`);
    }
    return cores.size;
  });
}

test.describe("visualizador 3D", () => {
  for (const id of ARQUETIPOS) {
    test(`desenha ${id} (screenshot)`, async ({ page }, testInfo) => {
      const erros = collectErrors(page);
      const viewer = await openViewer(page, `/referencia/${id}/economica`);
      expect(await distinctColors(page)).toBeGreaterThan(20);
      const png = await viewer.screenshot({ path: testInfo.outputPath(`3d-${id}.png`) });
      await testInfo.attach(`3d-${id}`, { body: png, contentType: "image/png" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(erros).toEqual([]);
    });
  }

  test("clicar numa peça abre o painel com função, selo, preço e onde procurar", async ({
    page,
  }) => {
    await openViewer(page, "/referencia/a2-fpv-5pol/economica");
    const viewer = regiao3d(page);
    await viewer.getByText("Peças no modelo", { exact: true }).click();
    await viewer.getByRole("button", { name: /XING2 2207/ }).click();
    const painel = page.getByRole("complementary", { name: "Detalhes do modelo" });
    await expect(painel.getByRole("heading", { name: /XING2 2207/ })).toBeVisible();
    await expect(painel).toContainText("Não verificado");
    await expect(painel).toContainText(/R\$\s[\d.,]+ a R\$\s[\d.,]+/);
    await expect(painel).toContainText("Onde procurar");
  });

  test("'ver no 3D' na lista de peças seleciona a peça no modelo", async ({ page }) => {
    await openViewer(page, "/referencia/a2-fpv-5pol/economica");
    await page.getByRole("button", { name: /Ver .*XING2 2207.* no 3D/ }).click();
    const painel = page.getByRole("complementary", { name: "Detalhes do modelo" });
    await expect(painel.getByRole("heading", { name: /XING2 2207/ })).toBeVisible();
  });

  test('trocar a hélice de 5" para 3" muda o modelo e avisa que é simulação', async ({
    page,
  }, testInfo) => {
    const viewer = await openViewer(page, "/referencia/a2-fpv-5pol/economica");
    const antes = await canvasSignature(page);
    await regiao3d(page).getByText("Experimentar (só o desenho)", { exact: true }).click();
    await page.getByLabel("Diâmetro da hélice").selectOption("3");
    await expect.poll(() => canvasSignature(page)).not.toBe(antes);
    await expect(
      page.getByRole("status").filter({ hasText: "Simulação só do desenho" }),
    ).toBeVisible();
    const png = await viewer.screenshot({ path: testInfo.outputPath("3d-a2-helice-3pol.png") });
    await testInfo.attach("3d-a2-helice-3pol", { body: png, contentType: "image/png" });
  });

  test("faixa que não existe dá 404; o endereço da Fase 2 redireciona", async ({ page }) => {
    const resposta = await page.goto("/referencia/a2-fpv-5pol/luxo");
    expect(resposta?.status()).toBe(404);
    await page.goto("/3d/a2-fpv-5pol/premium");
    await expect(page).toHaveURL(/\/referencia\/a2-fpv-5pol\/premium$/);
  });
});
