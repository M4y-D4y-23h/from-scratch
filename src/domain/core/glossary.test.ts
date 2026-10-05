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
  const matcher = compileGlossary(
    [
      "ESC",
      "FC",
      "LiPo",
      "Hélice",
      "Câmera FPV",
      "FPV",
      "Receptor",
      "Receptor de vídeo",
      "Armar",
    ].map((termo) => ({ termo })),
  );
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
