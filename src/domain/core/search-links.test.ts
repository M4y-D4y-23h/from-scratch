import { describe, expect, it } from "vitest";

import { aliExpressSearchUrl, mercadoLivreSearchUrl, searchLink } from "./search-links";

describe("links de busca (nunca anúncio específico)", () => {
  it("Mercado Livre: palavras separadas por hífen, espaços extras ignorados", () => {
    expect(mercadoLivreSearchUrl("  motor 2207   1750kv ")).toBe(
      "https://lista.mercadolivre.com.br/motor-2207-1750kv",
    );
  });

  it("Mercado Livre: caracteres especiais vão codificados", () => {
    expect(mercadoLivreSearchUrl('helice 5.1" tripa')).toBe(
      "https://lista.mercadolivre.com.br/helice-5.1%22-tripa",
    );
  });

  it("AliExpress: termo inteiro no parâmetro de busca", () => {
    expect(aliExpressSearchUrl("XT60 pigtail 12AWG")).toBe(
      "https://pt.aliexpress.com/wholesale?SearchText=XT60%20pigtail%2012AWG",
    );
  });

  it("searchLink devolve o nome do site para o rótulo do botão", () => {
    expect(searchLink("aliexpress", "gemfan 51466")).toMatchObject({
      site: "aliexpress",
      rotulo: "AliExpress",
    });
    expect(searchLink("mercado_livre", "gemfan 51466").rotulo).toBe("Mercado Livre");
  });
});
