import { expect, test } from "@playwright/test";

test.describe("página inicial", () => {
  test("abre em português, com título e aviso de que está em construção", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto("/");

    await expect(page).toHaveTitle("From Scratch");
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await expect(page.getByRole("heading", { level: 1, name: "From Scratch" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Em construção");
    await expect(page.getByRole("heading", { name: "Drones de referência" })).toBeVisible();
    await expect(page.getByRole("link", { name: 'FPV 5" de freestyle' })).toHaveAttribute(
      "href",
      "/referencia/a2-fpv-5pol/economica",
    );
    await expect(page.getByRole("heading", { name: "Seus projetos" })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("troca entre modo claro e escuro", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");

    await page.getByRole("button", { name: /mudar o tema/i }).click();
    await page.getByRole("menuitemradio", { name: "Escuro" }).click();
    await expect(html).toHaveClass(/\bdark\b/);

    await page.getByRole("button", { name: /mudar o tema/i }).click();
    await page.getByRole("menuitemradio", { name: "Claro" }).click();
    await expect(html).not.toHaveClass(/\bdark\b/);
  });
});
