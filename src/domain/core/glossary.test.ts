import { describe, expect, it } from "vitest";

import {
  compileGlossary,
  glossarySlug,
  missingRelatedTerms,
  parseGlossary,
  splitGlossary,
} from "./glossary";

const SAMPLE = [
  "# Glossário",
  "",
  "Introdução que deve ser ignorada.",
  "- **Explicação:** isto é da introdução",
  "",
  "## KV",
  "",
  "- **Explicação:** rotações por volt,",
  "  sem carga.",
  "- **Analogia:** marchas da bicicleta.",
  "- **Relacionados:** Hélice, Célula, 5,8 GHz",
  "",
  "## Hélice",
  "",
  "- **Explicação:** gira e empurra o ar.",
  "- **Relacionados:** KV",
  "- **Não sublinhar antes de:** de passo,",
  "  Gemfan",
].join("\r\n");

describe("parseGlossary", () => {
  it("lê termos, junta linhas de continuação e aceita CRLF", () => {
    const { termos, problemas } = parseGlossary(SAMPLE);
    expect(problemas).toEqual([]);
    expect(termos).toHaveLength(2);
    expect(termos[0]).toEqual({
      termo: "KV",
      explicacao: "rotações por volt, sem carga.",
      analogia: "marchas da bicicleta.",
      relacionados: ["Hélice", "Célula", "5,8 GHz"],
    });
    expect(termos[1]?.analogia).toBeUndefined();
    expect(termos[0]).not.toHaveProperty("nao_sublinhar_antes_de");
    expect(termos[1]?.nao_sublinhar_antes_de).toEqual(["de passo", "Gemfan"]);
  });

  it("aponta termo sem explicação e termo repetido", () => {
    const { problemas } = parseGlossary(
      "## A\n\n- **Analogia:** x\n\n## B\n- **Explicação:** y\n## b\n- **Explicação:** z",
    );
    expect(problemas).toHaveLength(2);
  });

  it("lista relacionados sem verbete", () => {
    const { termos } = parseGlossary(SAMPLE);
    expect(missingRelatedTerms(termos)).toEqual(["5,8 GHz", "Célula"]);
  });
});

describe("termos do glossário no texto da interface", () => {
  const matcher = compileGlossary([
    ...[
      "ESC",
      "FC",
      "LiPo",
      "Hélice",
      "Câmera FPV",
      "FPV",
      "Receptor de vídeo",
      "Armar",
      "Carregador balanceador",
    ].map((termo) => ({ termo })),
    { termo: "Receptor", nao_sublinhar_antes_de: ["OTG", "USB", "UVC"] },
  ]);
  const marcados = (texto: string) =>
    splitGlossary(texto, matcher)
      .filter((s) => s.termo)
      .map((s) => `${s.texto}→${s.termo}`);

  it("marca a primeira ocorrência de cada termo e preserva o texto inteiro", () => {
    const texto = "A hélice gira; outra hélice também. O ESC manda no motor.";
    const partes = splitGlossary(texto, matcher);
    expect(partes.map((p) => p.texto).join("")).toBe(texto);
    expect(marcados(texto)).toEqual(["hélice→Hélice", "ESC→ESC"]);
  });

  it("palavra comum: sem diferenciar maiúsculas e com plural", () => {
    expect(marcados("Hélices de reserva")).toEqual(["Hélices→Hélice"]);
    expect(marcados("receptores ELRS")).toEqual(["receptores→Receptor"]);
  });

  it("sigla: só em maiúsculas, com plural; não pega pedaço de palavra", () => {
    expect(marcados("4 ESCs e uma FC")).toEqual(["ESCs→ESC", "FC→FC"]);
    expect(marcados("o esc e a fc")).toEqual([]);
    expect(marcados("FCX e ESCA não são termos")).toEqual([]);
  });

  it("nome com maiúscula no meio aceita a primeira letra minúscula", () => {
    expect(marcados("bateria lipo")).toEqual([]);
    expect(marcados("bateria LiPo e câmera FPV")).toEqual(["LiPo→LiPo", "câmera FPV→Câmera FPV"]);
  });

  it("o termo mais longo vence o mais curto", () => {
    expect(marcados("Câmera FPV e voo FPV")).toEqual(["Câmera FPV→Câmera FPV", "FPV→FPV"]);
    expect(marcados("receptor de vídeo USB e o receptor do rádio")).toEqual([
      "receptor de vídeo→Receptor de vídeo",
      "receptor→Receptor",
    ]);
  });

  it("termo composto no plural: o plural vai na primeira palavra (ou em todas)", () => {
    expect(marcados("Os receptores de vídeo USB")).toEqual([
      "receptores de vídeo→Receptor de vídeo",
    ]);
    expect(marcados("duas câmeras FPV")).toEqual(["câmeras FPV→Câmera FPV"]);
    expect(marcados("carregadores balanceadores")).toEqual([
      "carregadores balanceadores→Carregador balanceador",
    ]);
    // "de" não vira "des": "receptor des vídeo" não é o termo composto.
    expect(marcados("receptor des vídeo")).toEqual(["receptor→Receptor"]);
  });

  it("não sublinha o termo antes das palavras de exceção (outra peça com o mesmo nome)", () => {
    expect(marcados("Ligar o receptor OTG no celular")).toEqual([]);
    expect(marcados("Receptor OTG UVC 5,8 GHz")).toEqual([]);
    expect(marcados("O vídeo do receptor USB depende do celular")).toEqual([]);
    expect(marcados("receptores usb")).toEqual([]);
    expect(marcados("Inclua câmera e receptor (USB ou óculos)")).toEqual([]);
    // A exceção é a palavra inteira, e o termo continua valendo no resto do texto.
    expect(marcados("receptor USBX")).toEqual(["receptor→Receptor"]);
    expect(marcados("o receptor USB e o receptor ELRS")).toEqual(["receptor→Receptor"]);
  });

  it("acentos contam como letra na fronteira da palavra", () => {
    expect(marcados("desarmar e armar")).toEqual(["armar→Armar"]);
  });

  it("continua a contagem entre trechos do mesmo bloco", () => {
    const vistos = new Set<string>();
    splitGlossary("O ESC esquenta.", matcher, vistos);
    expect(splitGlossary("Troque o ESC.", matcher, vistos).some((s) => s.termo)).toBe(false);
  });
});

describe("âncora do termo no glossário", () => {
  it("sem acento, minúsculas e hífens", () => {
    expect(glossarySlug("Câmera FPV")).toBe("camera-fpv");
    expect(glossarySlug("5,8 GHz")).toBe("5-8-ghz");
    expect(glossarySlug("C-rating")).toBe("c-rating");
  });
});
